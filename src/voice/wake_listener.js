import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeDir = path.resolve(__dirname, '..', 'native');

export class WakeListener extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isRunning = false;
    this.isPaused = false;
    this.restartTimer = null;
  }

  start() {
    if (this.isRunning) return;
    const scriptPath = path.join(nativeDir, 'wake_listener.ps1');
    const wakeWordsArg = config.voice.wakeWords.join(',');

    try {
      this.process = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-WakeWords',
          wakeWordsArg,
          '-MinConfidence',
          config.voice.minConfidence
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
      );

      this.isRunning = true;

      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const evt = JSON.parse(trimmed);
          this._handleEvent(evt);
        } catch (err) {
          // Non-JSON output
        }
      });

      this.process.stderr.on('data', (data) => {
        const errText = data.toString().trim();
        if (errText && !errText.includes('CLIXML')) {
          logger.warn('WakeListener stderr: ' + errText);
        }
      });

      this.process.on('close', (code) => {
        this.isRunning = false;
        this.process = null;
        logger.info(`Wake listener stopped (code ${code})`);
        
        // Auto-restart if unexpected termination
        if (!this._intentionalStop) {
          this.restartTimer = setTimeout(() => {
            logger.info('Restarting wake-word listener...');
            this.start();
          }, 3000);
        }
      });

      logger.info(`Wake listener initiated for words: [${wakeWordsArg}]`);
    } catch (err) {
      logger.error('Failed to start wake listener process', err);
      this.emit('fallback_mode', { reason: err.message });
    }
  }

  _handleEvent(evt) {
    if (evt.type === 'ready') {
      logger.success('Wake listener active and ready. Listening for: ' + evt.words.join(', '));
      this.emit('ready', evt);
    } else if (evt.type === 'detected') {
      const phrase = evt.phrase || 'Jarvis';
      logger.voice(`Wake word detected: "${phrase}" (Confidence: ${evt.confidence || 'Medium'})`);
      this.emit('wake', {
        phrase,
        confidence: evt.confidence,
        timestamp: new Date().toISOString()
      });
    } else if (evt.type === 'error') {
      logger.warn('Wake listener reported error: ' + evt.message);
      this.emit('error', evt);
    }
  }

  pause() {
    if (this.process && this.isRunning && !this.isPaused) {
      try {
        this.process.stdin.write('PAUSE\n');
        this.isPaused = true;
      } catch (err) {}
    }
  }

  resume() {
    if (this.process && this.isRunning && this.isPaused) {
      try {
        this.process.stdin.write('RESUME\n');
        this.isPaused = false;
      } catch (err) {}
    }
  }

  stop() {
    this._intentionalStop = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.process) {
      try {
        this.process.stdin.write('EXIT\n');
        this.process.kill();
      } catch (err) {}
      this.process = null;
    }
    this.isRunning = false;
  }
}

export const wakeListener = new WakeListener();
