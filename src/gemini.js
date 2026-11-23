import { config } from './config.js';
import { logger } from './logger.js';

let genAiClient = null;

// Initialize SDK or prepare native fetch fallback
async function getClient() {
  if (genAiClient) return genAiClient;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    if (config.gemini.apiKey) {
      genAiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey });
      logger.info('Initialized Google GenAI SDK client successfully');
      return genAiClient;
    }
  } catch (err) {
    logger.warn('Failed to load @google/genai SDK, falling back to direct REST fetch: ' + err.message);
  }
  return null;
}

// Fallback direct REST API caller
async function callGeminiRest(prompt, systemInstruction = '', model = config.gemini.model) {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;
  
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: config.gemini.temperature,
      maxOutputTokens: config.gemini.maxOutputTokens
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

export const gemini = {
  async ask(prompt, systemInstruction = '') {
    const defaultSystem = `You are JARVIS, an articulate, witty, and exceptionally intelligent AI assistant running 24/7 on an Intel Core i5 personal computer. 
You are speaking directly to your creator/user, who you address respectfully as "Sir" or by name when appropriate. 
Keep your spoken responses concise, authoritative, and actionable. When asked for code, SQL, or deep technical analysis, provide clear, robust, production-grade solutions.`;

    const finalSys = systemInstruction || defaultSystem;

    try {
      const client = await getClient();
      if (client) {
        const response = await client.models.generateContent({
          model: config.gemini.model,
          contents: prompt,
          config: {
            systemInstruction: finalSys,
            temperature: config.gemini.temperature
          }
        });
        return response.text || '';
      }
    } catch (sdkErr) {
      logger.warn('SDK call failed, attempting REST fallback: ' + sdkErr.message);
    }

    try {
      return await callGeminiRest(prompt, finalSys);
    } catch (restErr) {
      logger.warn('Gemini network offline or unreachable: ' + restErr.message);
      return `I am currently operating in offline autonomous mode, sir. Cloud intelligence is temporarily unreachable (${restErr.message}). All local computer controls, SQL studio, and file operations remain fully functional.`;
    }
  },

  async generateCode(task, language = 'javascript', context = '') {
    const prompt = `Task: ${task}
Target Language: ${language}
${context ? `Existing Context/Code:\n${context}\n` : ''}

Please write clean, modular, production-ready code. Output only the code with clear inline comments.`;

    const system = `You are Jarvis, Chief Systems & Software Architect. You write robust, secure, bug-free code optimized for performance on Windows and Intel architecture.`;
    return await this.ask(prompt, system);
  },

  async debugCode(code, language = 'auto', problemDescription = '') {
    const prompt = `Please inspect the following code, find all bugs, syntax issues, runtime pitfalls, and security vulnerabilities.
Target Language: ${language}
${problemDescription ? `Reported Issue: ${problemDescription}\n` : ''}

Code to analyze:
\`\`\`${language}
${code}
\`\`\`

Provide:
1. Summary of bugs found (syntax, logic, security).
2. The corrected, fully fixed code.
3. Explanation of the fixes and best practices.`;

    const system = `You are Jarvis QA & Inspector. You perform forensic code inspection, detect OWASP vulnerabilities, memory leaks, concurrency issues, and provide bulletproof fixes.`;
    return await this.ask(prompt, system);
  },

  async solveSql(naturalQuery, schemaContext = '') {
    const prompt = `User Request: "${naturalQuery}"
${schemaContext ? `Database Schema Context:\n${schemaContext}\n` : ''}

Generate the exact SQLite SQL query to solve this. Return JSON in this format:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of query logic",
  "recommendedIndexes": ["CREATE INDEX ... (optional)"]
}`;

    const system = `You are Jarvis Database Architect. You specialize in SQLite, PostgreSQL, and MySQL. Always write efficient, injection-safe SQL queries using CTEs and window functions when necessary.`;
    return await this.ask(prompt, system);
  }
};
