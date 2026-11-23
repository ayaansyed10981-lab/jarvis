import fs from 'fs';
import { gemini } from '../gemini.js';
import { logger } from '../logger.js';

class Debugger {
  async inspectCode({ code, filePath = '', language = 'javascript', issueDescription = '' }) {
    let targetCode = code;
    if (!targetCode && filePath && fs.existsSync(filePath)) {
      targetCode = fs.readFileSync(filePath, 'utf8');
    }

    if (!targetCode) {
      return { success: false, error: 'No code or valid file provided for analysis' };
    }

    logger.info(`Analyzing code for bugs and vulnerabilities (Language: ${language})...`);

    const analysis = await gemini.debugCode(targetCode, language, issueDescription);

    // Extract fixed code if contained in code blocks
    const codeMatch = analysis.match(/```(?:[a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/);
    const fixedCode = codeMatch ? codeMatch[1].trim() : '';

    return {
      success: true,
      analysis,
      fixedCode,
      analyzedLength: targetCode.length,
      language
    };
  }

  // Quick local static checks for common mistakes
  quickStaticCheck(code, language = 'javascript') {
    const findings = [];
    const lang = language.toLowerCase();

    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
      if (/\bdebugger\b/.test(code)) findings.push({ type: 'warning', message: 'Leftover debugger statement found' });
      if (/(?:api_key|secret|password|auth_token)\s*=\s*['"][a-zA-Z0-9_\-]{8,}['"]/i.test(code)) {
        findings.push({ type: 'security', message: 'Potential hardcoded secret or API key detected' });
      }
      if (/==(?!=)/.test(code)) {
        findings.push({ type: 'style', message: 'Loose equality (==) detected. Prefer strict equality (===)' });
      }
      if (/eval\s*\(/.test(code)) {
        findings.push({ type: 'security', message: 'Dangerous eval() usage detected (Remote Code Execution risk)' });
      }
    } else if (lang === 'python' || lang === 'py') {
      if (/(?:api_key|secret|password)\s*=\s*['"][a-zA-Z0-9_\-]{8,}['"]/i.test(code)) {
        findings.push({ type: 'security', message: 'Potential hardcoded secret or API key detected' });
      }
      if (/except\s*:\s*pass/.test(code)) {
        findings.push({ type: 'warning', message: 'Bare except with pass hides critical runtime errors' });
      }
    } else if (lang === 'sql') {
      if (/SELECT\s+\*\s+FROM/i.test(code)) {
        findings.push({ type: 'perf', message: 'SELECT * retrieved; recommend specifying column names for performance' });
      }
      if (/(?:UPDATE|DELETE)\s+FROM\s+\w+\s*(?:;|$)/i.test(code)) {
        findings.push({ type: 'critical', message: 'Unbounded UPDATE/DELETE detected without WHERE clause!' });
      }
    }

    return findings;
  }
}

export const debuggerInspector = new Debugger();
