import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const logFile = path.join(config.paths.logs, 'jarvis.log');

function formatTimestamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function appendToFile(level, message, meta) {
  try {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `[${formatTimestamp()}] [${level}] ${message}${metaStr}\n`;
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    // Non-blocking log failure
  }
}

export const logger = {
  info(msg, meta) {
    console.log(`\x1b[36m[${formatTimestamp()}] [INFO]\x1b[0m ${msg}`, meta ? meta : '');
    appendToFile('INFO', msg, meta);
  },
  success(msg, meta) {
    console.log(`\x1b[32m[${formatTimestamp()}] [SUCCESS]\x1b[0m ${msg}`, meta ? meta : '');
    appendToFile('SUCCESS', msg, meta);
  },
  warn(msg, meta) {
    console.log(`\x1b[33m[${formatTimestamp()}] [WARN]\x1b[0m ${msg}`, meta ? meta : '');
    appendToFile('WARN', msg, meta);
  },
  error(msg, err) {
    console.error(`\x1b[31m[${formatTimestamp()}] [ERROR]\x1b[0m ${msg}`, err || '');
    appendToFile('ERROR', msg, err ? { error: err.message || err.toString(), stack: err.stack } : null);
  },
  voice(msg) {
    console.log(`\x1b[35m[${formatTimestamp()}] [VOICE/JARVIS]\x1b[0m ${msg}`);
    appendToFile('VOICE', msg);
  },
  system(msg) {
    console.log(`\x1b[34m[${formatTimestamp()}] [SYSTEM]\x1b[0m ${msg}`);
    appendToFile('SYSTEM', msg);
  }
};
