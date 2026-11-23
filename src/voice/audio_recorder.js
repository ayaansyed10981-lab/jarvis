import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeDir = path.resolve(__dirname, '..', 'native');

export class AudioRecorder {
  constructor() {
    this.tempDir = path.join(config.rootDir, '.tmp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  recordCommand() {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, `cmd_${Date.now()}.wav`);
      const scriptPath = path.join(nativeDir, 'record_command.ps1');

      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-OutputPath',
        outputPath,
        '-WaitSpeechMs',
        String(config.voice.recordWaitSpeechMs),
        '-SilenceMs',
        String(config.voice.recordSilenceMs),
        '-MaxDurationMs',
        String(config.voice.recordMaxMs),
        '-VadThreshold',
        String(config.voice.vadThreshold)
      ];

      const proc = spawn('powershell.exe', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let recorded = false;

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const evt = JSON.parse(line.trim());
          if (evt.type === 'recorded' && evt.success) {
            recorded = true;
          }
        } catch (e) {}
      });

      proc.on('close', (code) => {
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          resolve(outputPath);
        } else {
          resolve(null); // No speech detected or timeout
        }
      });

      proc.on('error', (err) => {
        logger.error('Audio recording failed', err);
        resolve(null);
      });
    });
  }

  cleanTemp(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }
  }
}

export const audioRecorder = new AudioRecorder();
