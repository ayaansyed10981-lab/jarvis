import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../logger.js';

class AnimationStudio {
  constructor() {
    this.charactersDir = config.paths.mediaCharacters;
    this.outputsDir = config.paths.mediaOutputs;
    if (!fs.existsSync(this.charactersDir)) {
      fs.mkdirSync(this.charactersDir, { recursive: true });
    }
  }

  // Generate an interactive HTML5 / Canvas animated character package
  createCharacterPackage({ name = 'Cyber Jarvis', type = 'jarvis-core', dialogue = 'Hello sir, Jarvis at your service.' }) {
    const charSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const htmlFile = path.join(this.charactersDir, `${charSlug}.html`);

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name} - Animated Character</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #00f0ff;
    }
    .stage {
      position: relative;
      width: 480px;
      height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .dialogue-box {
      margin-top: 20px;
      background: rgba(0, 20, 40, 0.85);
      border: 1px solid #00f0ff;
      border-radius: 12px;
      padding: 14px 24px;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.4);
      max-width: 440px;
      text-align: center;
      font-size: 15px;
      letter-spacing: 0.5px;
      animation: float 3s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    .controls {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }
    button {
      background: #003366;
      color: #00f0ff;
      border: 1px solid #00f0ff;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    button:hover {
      background: #00f0ff;
      color: #000;
      box-shadow: 0 0 15px #00f0ff;
    }
  </style>
</head>
<body>
  <div class="stage">
    <canvas id="charCanvas" width="480" height="480"></canvas>
  </div>
  <div class="dialogue-box" id="dialogueText">${dialogue}</div>
  <div class="controls">
    <button onclick="toggleSpeaking()">Toggle Speaking</button>
    <button onclick="recordVideo()">Export Video Clip</button>
  </div>

  <script>
    const canvas = document.getElementById('charCanvas');
    const ctx = canvas.getContext('2d');
    let isSpeaking = true;
    let t = 0;

    function toggleSpeaking() {
      isSpeaking = !isSpeaking;
    }

    function draw() {
      t += 0.05;
      ctx.clearRect(0, 0, 480, 480);

      const cx = 240;
      const cy = 240 + Math.sin(t * 1.5) * 12; // floating hover

      // Outer Glow
      const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 180);
      glow.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 180, 0, Math.PI * 2);
      ctx.fill();

      // Rotating Orbital Rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 110, 0, Math.PI * 1.2);
      ctx.stroke();

      ctx.rotate(-t * 1.6);
      ctx.strokeStyle = '#00a8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 130, Math.PI * 0.5, Math.PI * 1.8);
      ctx.stroke();
      ctx.restore();

      // Central Reactor / Core
      const corePulse = isSpeaking ? Math.sin(t * 8) * 8 : Math.sin(t * 2) * 3;
      const coreR = 60 + corePulse;
      const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, coreR);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, '#00f0ff');
      coreGrad.addColorStop(1, '#003366');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Digital Optical Eye / Sensors
      ctx.fillStyle = '#ffffff';
      const eyeOffset = Math.sin(t * 3) * 6;
      ctx.beginPath();
      ctx.arc(cx - 20, cy - 8 + eyeOffset, 6, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy - 8 + eyeOffset, 6, 0, Math.PI * 2);
      ctx.fill();

      // Speaking Voice Waveform inside Core
      if (isSpeaking) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = -35; x <= 35; x += 5) {
          const waveY = Math.sin(t * 10 + x * 0.2) * (12 + Math.sin(t * 5) * 6);
          if (x === -35) ctx.moveTo(cx + x, cy + 22 + waveY);
          else ctx.lineTo(cx + x, cy + 22 + waveY);
        }
        ctx.stroke();
      }

      requestAnimationFrame(draw);
    }

    draw();

    // Canvas Recording into WebM Video Clip
    function recordVideo(durationSec = 5) {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];

      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '${charSlug}_character_clip.webm';
        a.click();
      };

      recorder.start();
      alert('Recording character video clip for ' + durationSec + ' seconds...');
      setTimeout(() => recorder.stop(), durationSec * 1000);
    }
  </script>
</body>
</html>`;

    fs.writeFileSync(htmlFile, htmlContent, 'utf8');
    logger.success(`Animated character template generated at: ${htmlFile}`);

    return {
      success: true,
      name,
      htmlFile,
      characterType: type
    };
  }

  // Pre-seed sample character packages
  seedDefaultCharacters() {
    this.createCharacterPackage({
      name: 'Iron Jarvis Core',
      type: 'jarvis-core',
      dialogue: 'All systems online and optimized for your Intel Core i5 processor, sir.'
    });
    this.createCharacterPackage({
      name: 'Cyber Sentinel',
      type: 'robot-avatar',
      dialogue: 'Threat telemetry nominal. Monitoring code and databases.'
    });
  }
}

export const animationStudio = new AnimationStudio();
