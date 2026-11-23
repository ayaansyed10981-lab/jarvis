import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeDir = path.resolve(__dirname, '..', 'native');
const scriptPath = path.join(nativeDir, 'computer_control.ps1');

class ComputerControl {
  constructor() {
    this.controlProcess = null;
    this.pendingCallbacks = new Map();
    this.reqId = 0;
  }

  _getProcess() {
    if (this.controlProcess && !this.controlProcess.killed) {
      return this.controlProcess;
    }

    try {
      this.controlProcess = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
      );

      let buffer = '';
      this.controlProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep remainder

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const res = JSON.parse(trimmed);
            if (res.reqId && this.pendingCallbacks.has(res.reqId)) {
              const cb = this.pendingCallbacks.get(res.reqId);
              this.pendingCallbacks.delete(res.reqId);
              cb(res);
            }
          } catch (e) {}
        }
      });

      this.controlProcess.stderr.on('data', (d) => {
        logger.warn('ComputerControl stderr: ' + d.toString().trim());
      });

      this.controlProcess.on('close', () => {
        this.controlProcess = null;
      });

      return this.controlProcess;
    } catch (err) {
      logger.error('Failed to spawn computer_control process', err);
      return null;
    }
  }

  send(action, params = {}) {
    return new Promise((resolve) => {
      const proc = this._getProcess();
      if (!proc) {
        return resolve({ success: false, error: 'Control process unavailable' });
      }

      const id = ++this.reqId;
      const payload = JSON.stringify({ reqId: id, action, ...params }) + '\n';

      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          resolve({ success: false, error: 'Command timed out' });
        }
      }, 8000);

      this.pendingCallbacks.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      proc.stdin.write(payload, 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCallbacks.delete(id);
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  // Volume
  async setVolume(level) {
    const val = Math.max(0, Math.min(100, parseInt(level, 10)));
    return await this.send('set_volume', { level: val });
  }

  async volumeUp(delta = 10) {
    return await this.send('volume_up', { delta });
  }

  async volumeDown(delta = 10) {
    return await this.send('volume_down', { delta });
  }

  async mute() {
    return await this.send('mute');
  }

  async unmute() {
    return await this.send('unmute');
  }

  // Applications
  async openApp(appName) {
    const commonApps = {
      chrome: 'chrome',
      google: 'chrome',
      browser: 'chrome',
      edge: 'msedge',
      code: 'code',
      vscode: 'code',
      notepad: 'notepad',
      calc: 'calc',
      calculator: 'calc',
      explorer: 'explorer',
      files: 'explorer',
      cmd: 'cmd',
      terminal: 'wt',
      powershell: 'powershell',
      taskmgr: 'taskmgr',
      spotify: 'spotify',
      paint: 'mspaint'
    };

    const target = commonApps[appName.toLowerCase()] || appName;
    return await this.send('launch_app', { app: target });
  }

  async closeApp(appName) {
    return await this.send('close_app', { name: appName });
  }

  // Windows & Screen
  async showDesktop() {
    return await this.send('show_desktop');
  }

  async lock() {
    return await this.send('lock_screen');
  }

  async takeScreenshot() {
    const filename = `screenshot_${Date.now()}.png`;
    const targetPath = path.join(config.paths.screenshots, filename);
    const res = await this.send('screenshot', { path: targetPath });
    if (res.success || fs.existsSync(targetPath)) {
      return { success: true, path: targetPath, filename };
    }
    return { success: false, error: res.error || 'Failed to capture screenshot' };
  }

  // Hardware & Telemetry
  async getTelemetry() {
    const res = await this.send('telemetry');
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Intel Core i5';
    const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
    const usedMemGB = (totalMemGB - freeMemGB).toFixed(1);
    const memUsagePct = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);

    return {
      cpuModel,
      cpuCores: cpus.length,
      platform: 'Windows (x64 Intel i5 Optimized)',
      hostname: os.hostname(),
      uptimeMinutes: Math.round(os.uptime() / 60),
      memory: {
        totalGB: totalMemGB,
        usedGB: usedMemGB,
        freeGB: freeMemGB,
        percent: memUsagePct
      },
      system: res.data || {}
    };
  }

  // Natural Language Command Parser for Fast System Controls
  async handleVoiceIntent(text) {
    const t = text.toLowerCase().trim();

    // Volume controls
    if (/\b(?:mute|silence)\b/.test(t) && !t.includes('unmute')) {
      await this.mute();
      return 'System audio muted, sir.';
    }
    if (/\bunmute\b/.test(t)) {
      await this.unmute();
      return 'Audio unmuted, sir.';
    }
    if (/\b(?:volume\s*up|increase\s*volume|louder)\b/.test(t)) {
      await this.volumeUp(10);
      return 'Volume increased, sir.';
    }
    if (/\b(?:volume\s*down|decrease\s*volume|lower\s*volume|softer)\b/.test(t)) {
      await this.volumeDown(10);
      return 'Volume decreased, sir.';
    }
    const volMatch = t.match(/\b(?:set\s*volume\s*(?:to)?|volume)\s*(\d{1,3})/);
    if (volMatch) {
      const lvl = parseInt(volMatch[1], 10);
      await this.setVolume(lvl);
      return `Volume adjusted to ${lvl} percent, sir.`;
    }

    // Screenshots
    if (/\b(?:screenshot|capture\s*screen|take\s*a\s*snap|print\s*screen)\b/.test(t)) {
      const ss = await this.takeScreenshot();
      return ss.success
        ? `Screenshot captured and saved successfully, sir.`
        : `I was unable to take the screenshot: ${ss.error}`;
    }

    // Windows & Desktop
    if (/\b(?:show\s*desktop|minimize\s*all)\b/.test(t)) {
      await this.showDesktop();
      return 'Showing desktop, sir.';
    }
    if (/\b(?:lock\s*(?:my\s*)?(?:computer|pc|screen))\b/.test(t)) {
      await this.lock();
      return 'Locking workstation now, sir.';
    }

    // App launch
    const openMatch = t.match(/\b(?:open|launch|start)\s+([a-z0-9_\-\s]+)/i);
    if (openMatch) {
      const app = openMatch[1].replace(/^(app|application|the)\s+/i, '').trim();
      const res = await this.openApp(app);
      return res.success ? `Opening ${app}, sir.` : `Unable to open ${app}: ${res.error}`;
    }

    // App close
    const closeMatch = t.match(/\b(?:close|quit|kill|exit)\s+([a-z0-9_\-\s]+)/i);
    if (closeMatch) {
      const app = closeMatch[1].replace(/^(app|application|the)\s+/i, '').trim();
      const res = await this.closeApp(app);
      return res.success ? `Closed ${app}, sir.` : `Unable to close ${app}: ${res.error}`;
    }

    // Telemetry
    if (/\b(?:battery|status|ram|cpu|memory|specs|telemetry)\b/.test(t)) {
      const telem = await this.getTelemetry();
      return `System is running at ${telem.memory.percent}% RAM utilization (${telem.memory.usedGB} of ${telem.memory.totalGB} GB used). All systems are nominal on your ${telem.cpuModel}, sir.`;
    }

    return null; // Not a recognized system command, pass to AI
  }
}

export const computerControl = new ComputerControl();
