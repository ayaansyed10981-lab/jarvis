import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';
import { gemini } from './gemini.js';
import { computerControl } from './tools/computer_control.js';
import { coder } from './tools/coder.js';
import { debuggerInspector } from './tools/debugger.js';
import { sqlEngine } from './tools/sql_engine.js';
import { videoEditor } from './tools/video_editor.js';
import { animationStudio } from './tools/animation_studio.js';
import { speechSynthesizer } from './voice/speech_synthesizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

export class HudServer {
  constructor() {
    this.server = null;
    this.wss = null;
    this.clients = new Set();
  }

  start() {
    this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info('HUD client connected via WebSocket');

      // Send initial state
      ws.send(JSON.stringify({
        type: 'init',
        wakeWords: config.voice.wakeWords,
        cpuTarget: config.hardware.cpuTarget
      }));

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleWsMessage(ws, msg);
        } catch (e) {}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    this.server.listen(config.port, config.host, () => {
      logger.success(`HUD Web Interface running at http://${config.host}:${config.port}`);
    });
  }

  broadcast(event, data) {
    const payload = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }

  async _handleWsMessage(ws, msg) {
    if (msg.action === 'voice_input' || msg.action === 'text_command') {
      const query = msg.text;
      logger.voice(`Command received from HUD: "${query}"`);

      // 1. Try fast local computer control intent first
      const sysResponse = await computerControl.handleVoiceIntent(query);
      if (sysResponse) {
        speechSynthesizer.speak(sysResponse);
        ws.send(JSON.stringify({ type: 'assistant_reply', reply: sysResponse, isSystem: true }));
        this.broadcast('activity', { query, reply: sysResponse });
        return;
      }

      // 2. Query Gemini AI
      try {
        const reply = await gemini.ask(query);
        speechSynthesizer.speak(reply);
        ws.send(JSON.stringify({ type: 'assistant_reply', reply, isSystem: false }));
        this.broadcast('activity', { query, reply });
      } catch (err) {
        const errorReply = `Error processing request: ${err.message}`;
        ws.send(JSON.stringify({ type: 'assistant_reply', reply: errorReply, error: true }));
      }
    }
  }

  async _handleHttpRequest(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API Routes
    if (pathname.startsWith('/api/')) {
      return this._handleApi(req, res, pathname);
    }

    // Static Files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(publicDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  async _handleApi(req, res, pathname) {
    const parseBody = () => new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
      });
    });

    const sendJson = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Telemetry
    if (pathname === '/api/telemetry' && req.method === 'GET') {
      const telem = await computerControl.getTelemetry();
      return sendJson(telem);
    }

    // System Control
    if (pathname === '/api/control' && req.method === 'POST') {
      const body = await parseBody();
      if (body.action === 'volume') {
        const r = await computerControl.setVolume(body.level);
        return sendJson(r);
      }
      if (body.action === 'screenshot') {
        const r = await computerControl.takeScreenshot();
        return sendJson(r);
      }
      if (body.action === 'open_app') {
        const r = await computerControl.openApp(body.app);
        return sendJson(r);
      }
      if (body.action === 'lock') {
        const r = await computerControl.lock();
        return sendJson(r);
      }
      if (body.action === 'desktop') {
        const r = await computerControl.showDesktop();
        return sendJson(r);
      }
    }

    // Coding
    if (pathname === '/api/code/generate' && req.method === 'POST') {
      const body = await parseBody();
      const r = await coder.generateCode(body);
      return sendJson(r);
    }
    if (pathname === '/api/code/run' && req.method === 'POST') {
      const body = await parseBody();
      const r = await coder.runScript(body);
      return sendJson(r);
    }
    if (pathname === '/api/code/debug' && req.method === 'POST') {
      const body = await parseBody();
      const staticFindings = debuggerInspector.quickStaticCheck(body.code || '', body.language || 'javascript');
      const r = await debuggerInspector.inspectCode(body);
      return sendJson({ ...r, staticFindings });
    }

    // SQL Studio
    if (pathname === '/api/sql/run' && req.method === 'POST') {
      const body = await parseBody();
      const r = sqlEngine.runQuery(body.sql || '');
      return sendJson(r);
    }
    if (pathname === '/api/sql/solve' && req.method === 'POST') {
      const body = await parseBody();
      const r = await sqlEngine.solveQuery(body.query || '');
      return sendJson(r);
    }
    if (pathname === '/api/sql/schema' && req.method === 'GET') {
      const schema = sqlEngine.getSchema();
      return sendJson({ schema });
    }

    // Video & Animation
    if (pathname === '/api/video/trim' && req.method === 'POST') {
      const body = await parseBody();
      const r = await videoEditor.trimVideo(body);
      return sendJson(r);
    }
    if (pathname === '/api/video/overlay' && req.method === 'POST') {
      const body = await parseBody();
      const r = await videoEditor.overlayAnimatedCharacter(body);
      return sendJson(r);
    }
    if (pathname === '/api/characters/generate' && req.method === 'POST') {
      const body = await parseBody();
      const r = animationStudio.createCharacterPackage(body);
      return sendJson(r);
    }

    sendJson({ error: 'Endpoint not found' }, 404);
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const hudServer = new HudServer();
