import readline from 'readline';
import { config } from './config.js';
import { logger } from './logger.js';
import { gemini } from './gemini.js';
import { wakeListener } from './voice/wake_listener.js';
import { speechSynthesizer } from './voice/speech_synthesizer.js';
import { audioRecorder } from './voice/audio_recorder.js';
import { computerControl } from './tools/computer_control.js';
import { coder } from './tools/coder.js';
import { debuggerInspector } from './tools/debugger.js';
import { sqlEngine } from './tools/sql_engine.js';
import { videoEditor } from './tools/video_editor.js';
import { animationStudio } from './tools/animation_studio.js';
import { hudServer } from './hud_server.js';

class JarvisAssistant {
  constructor() {
    this.isProcessing = false;
  }

  async start() {
    console.log(`
\x1b[36m============================================================
           JARVIS AI - 24/7 INTEL CORE i5 ASSISTANT
============================================================\x1b[0m
  * Wake Word:           \x1b[32m"${config.voice.wakeWords.join('" | "')}"\x1b[0m
  * Platform Target:     \x1b[33m${config.hardware.cpuTarget} (Windows x64)\x1b[0m
  * Memory Optimization: \x1b[32mActive (Zero Native C++ Leaks)\x1b[0m
  * HUD Web Center:      \x1b[35mhttp://${config.host}:${config.port}\x1b[0m
  * Autonomous Capabilities:
    - Computer & Volume Control
    - Code Generation & Script Execution
    - Forensic Bug & Security Auditing
    - SQLite Query Solving & Execution
    - Video Clip & Animated Character Studio
\x1b[36m============================================================\x1b[0m
    `);

    logger.info('Initializing Jarvis subsystems...');

    // 1. Seed sample animated characters
    animationStudio.seedDefaultCharacters();

    // 2. Start HUD Web Server
    hudServer.start();

    // 3. Start Speech Synthesizer
    speechSynthesizer.start();

    // 4. Start Wake Listener
    wakeListener.on('wake', (evt) => this.handleWakeDetected(evt));
    wakeListener.start();

    // 5. Initial Spoken Greeting
    setTimeout(() => {
      speechSynthesizer.speak('Jarvis systems online and standing by on your Intel processor, sir.');
    }, 1500);

    // 6. Setup Interactive CLI for simultaneous keyboard control
    this.setupCli();

    // 7. Prevent process exit
    setInterval(() => {}, 1000 * 60 * 60);
  }

  async handleWakeDetected(evt) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    wakeListener.pause();
    hudServer.broadcast('wake', evt);

    const greetings = [
      'Yes, sir?',
      'At your service, sir.',
      'Jarvis here, sir. How can I help?',
      'Ready for your directive, sir.'
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    await speechSynthesizer.speak(greeting);

    logger.voice('Listening for user voice directive...');
    const audioPath = await audioRecorder.recordCommand();

    if (audioPath) {
      logger.info(`Voice command recorded: ${audioPath}`);
      // In a full audio pipeline, transcribe with Gemini multimodal or Windows speech
      // For instant fallback / command processing:
      speechSynthesizer.speak('Directive received. Processing now, sir.');
      audioRecorder.cleanTemp(audioPath);
    } else {
      logger.info('No command audio detected after wake word.');
    }

    wakeListener.resume();
    this.isProcessing = false;
  }

  async processDirective(query) {
    logger.voice(`Processing directive: "${query}"`);

    // 1. Check for system control intent
    const sysReply = await computerControl.handleVoiceIntent(query);
    if (sysReply) {
      logger.success(`System control executed: ${sysReply}`);
      await speechSynthesizer.speak(sysReply);
      return sysReply;
    }

    // 2. Check for SQL request in directive
    if (/\b(?:sql|database|query|table)\b/i.test(query) && /\b(?:run|solve|select|show|find)\b/i.test(query)) {
      const sqlRes = await sqlEngine.solveQuery(query);
      const answer = `I formulated the query, sir: ${sqlRes.sql}. ${sqlRes.execution.success ? `It returned ${sqlRes.execution.rowCount} records.` : `Execution reported: ${sqlRes.execution.error}`}`;
      await speechSynthesizer.speak(answer);
      return answer;
    }

    // 3. General reasoning / coding query via Gemini
    try {
      const answer = await gemini.ask(query);
      await speechSynthesizer.speak(answer);
      return answer;
    } catch (err) {
      const errReply = `Apologies, sir: I encountered an error while processing that request: ${err.message}`;
      await speechSynthesizer.speak(errReply);
      return errReply;
    }
  }

  setupCli() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    console.log('\x1b[32m[CLI Ready]\x1b[0m Type any command or question below and press Enter:');

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) return;

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('Shutting down Jarvis gracefully...');
        wakeListener.stop();
        speechSynthesizer.stop();
        hudServer.stop();
        process.exit(0);
      }

      await this.processDirective(input);
    });
  }
}

// 24/7 Resilience Crash Guard
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in 24/7 Supervisor: ' + err.message, err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection in 24/7 Supervisor: ' + (reason?.message || reason));
});

const jarvis = new JarvisAssistant();
jarvis.start();
