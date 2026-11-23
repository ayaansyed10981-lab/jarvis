import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env if present
dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  rootDir,
  port: parseInt(process.env.HUD_PORT || '5050', 10),
  host: process.env.HUD_HOST || 'localhost',
  
  // Gemini AI configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    temperature: 0.4,
    maxOutputTokens: 4096
  },
  
  // Voice & Wake-word configuration
  voice: {
    wakeWords: (process.env.WAKE_WORDS || 'jarvis,hey jarvis,ok jarvis,okay jarvis')
      .split(',')
      .map(w => w.trim().toLowerCase())
      .filter(Boolean),
    minConfidence: process.env.WAKE_CONFIDENCE || 'Medium',
    defaultVoice: process.env.WINDOWS_TTS_VOICE || 'Microsoft David Desktop',
    fallbackVoice: 'Microsoft David Desktop',
    speechRate: 1, // 0 to 10
    recordWaitSpeechMs: parseInt(process.env.RECORD_WAIT_SPEECH_MS || '6000', 10),
    recordSilenceMs: parseInt(process.env.RECORD_SILENCE_MS || '1400', 10),
    recordMaxMs: parseInt(process.env.RECORD_MAX_MS || '15000', 10),
    vadThreshold: parseInt(process.env.VAD_THRESHOLD || '450', 10)
  },
  
  // Intel Core i5 optimization profiles
  hardware: {
    cpuTarget: 'Intel Core i5',
    architecture: 'x64',
    maxWorkerThreads: 4,
    powerSaveThrottleMs: 100, // sleep idle loop to keep CPU < 0.5%
    autoRestartOnCrash: true
  },
  
  // Workspace directories
  paths: {
    database: path.join(rootDir, 'database', 'jarvis_data.db'),
    projects: path.join(rootDir, 'projects'),
    media: path.join(rootDir, 'media'),
    mediaInputs: path.join(rootDir, 'media', 'inputs'),
    mediaOutputs: path.join(rootDir, 'media', 'outputs'),
    mediaCharacters: path.join(rootDir, 'media', 'characters'),
    screenshots: path.join(rootDir, 'screenshots'),
    logs: path.join(rootDir, 'logs')
  }
};
