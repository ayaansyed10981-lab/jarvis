import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeDir = path.resolve(__dirname, '..', 'native');

class SpeechSynthesizer {
  constructor() {
    this.process = null;
    this.voice = config.voice.defaultVoice;
    this.queue = [];
    this.isSpeaking = false;
  }

  start() {
    const scriptPath = path.join(nativeDir, 'audio_out.ps1');
    try {
      this.process = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DefaultVoice', this.voice],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
      );

      this.process.stdout.on('data', (data) => {
        const text = data.toString().trim();
        // audio_out writes status lines
      });

      this.process.stderr.on('data', (data) => {
        logger.warn('AudioOut stderr: ' + data.toString().trim());
      });

      this.process.on('close', (code) => {
        logger.info(`Speech synthesizer process exited with code ${code}`);
        this.process = null;
      });

      logger.info(`Speech synthesizer initialized with voice: ${this.voice}`);
    } catch (err) {
      logger.error('Failed to start speech synthesizer process', err);
    }
  }

  speak(text, voice = this.voice) {
    if (!text || typeof text !== 'string') return Promise.resolve();
    
    // Clean text of markdown asterisks, code fences, etc. for cleaner speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted from speech.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#~]/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) return Promise.resolve();

    return new Promise((resolve) => {
      this.queue.push({ text: cleanText, voice, resolve });
      this._processQueue();
    });
  }

  _processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;
    this.isSpeaking = true;
    const item = this.queue.shift();

    if (!this.process || this.process.killed) {
      this.start();
    }

    try {
      const payload = JSON.stringify({ action: 'speak', text: item.text, voice: item.voice }) + '\n';
      this.process.stdin.write(payload, 'utf8', (err) => {
        if (err) logger.warn('Error writing to audio_out: ' + err.message);
      });

      // Rough duration estimation based on word count (~150 words per minute)
      const words = item.text.split(/\s+/).length;
      const durationMs = Math.max(1200, Math.min(25000, (words / 2.8) * 1000));

      setTimeout(() => {
        this.isSpeaking = false;
        item.resolve();
        this._processQueue();
      }, durationMs);
    } catch (err) {
      logger.error('Failed to dispatch speak text', err);
      this.isSpeaking = false;
      item.resolve();
      this._processQueue();
    }
  }

  stop() {
    if (this.process) {
      try {
        this.process.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
        this.process.kill();
      } catch (err) {}
      this.process = null;
    }
    this.queue = [];
    this.isSpeaking = false;
  }
}

export const speechSynthesizer = new SpeechSynthesizer();
