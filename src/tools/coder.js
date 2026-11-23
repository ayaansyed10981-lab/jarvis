import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../config.js';
import { gemini } from '../gemini.js';
import { logger } from '../logger.js';

class Coder {
  constructor() {
    this.projectsDir = config.paths.projects;
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  async generateCode({ task, language = 'javascript', projectName = 'default_project', filename = '' }) {
    logger.info(`Generating code for task: "${task}" in language: ${language}`);
    
    const rawResult = await gemini.generateCode(task, language);

    // Extract clean code from markdown code fences if present
    const codeMatch = rawResult.match(/```(?:[a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : rawResult.trim();

    // Determine target file
    const targetDir = path.join(this.projectsDir, projectName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const extMap = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      html: 'html',
      css: 'css',
      sql: 'sql',
      json: 'json',
      c: 'c',
      cpp: 'cpp',
      csharp: 'cs',
      powershell: 'ps1'
    };

    const ext = extMap[language.toLowerCase()] || 'txt';
    const finalFilename = filename || `solution_${Date.now()}.${ext}`;
    const filePath = path.join(targetDir, finalFilename);

    fs.writeFileSync(filePath, code, 'utf8');
    logger.success(`Code saved to: ${filePath}`);

    return {
      success: true,
      code,
      filePath,
      filename: finalFilename,
      projectName,
      language
    };
  }

  async runScript({ filePath, runtime = 'node', timeoutMs = 15000 }) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    return new Promise((resolve) => {
      let command = 'node';
      let args = [filePath];

      if (runtime === 'python' || filePath.endsWith('.py')) {
        command = 'py.exe';
        args = [filePath];
      } else if (runtime === 'powershell' || filePath.endsWith('.ps1')) {
        command = 'powershell.exe';
        args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', filePath];
      }

      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const proc = spawn(command, args, { windowsHide: true });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          error: `Execution timed out after ${timeoutMs}ms`,
          stdout,
          stderr
        });
      }, timeoutMs);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          success: code === 0,
          exitCode: code,
          durationMs,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `Failed to execute: ${err.message}`,
          stdout,
          stderr
        });
      });
    });
  }

  listProjects() {
    try {
      const items = fs.readdirSync(this.projectsDir, { withFileTypes: true });
      return items
        .filter((i) => i.isDirectory())
        .map((dir) => {
          const files = fs.readdirSync(path.join(this.projectsDir, dir.name));
          return { name: dir.name, filesCount: files.length, files };
        });
    } catch (err) {
      return [];
    }
  }
}

export const coder = new Coder();
