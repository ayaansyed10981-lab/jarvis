import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VideoEditor {
  constructor() {
    this.ffmpegPath = this._locateFfmpeg();
    this.outputDir = config.paths.mediaOutputs;
    this.inputsDir = config.paths.mediaInputs;
    this.charactersDir = config.paths.mediaCharacters;

    [this.outputDir, this.inputsDir, this.charactersDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
  }

  _locateFfmpeg() {
    // 1. Check local bin/ directory
    const localBin = path.join(config.rootDir, 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localBin)) return localBin;

    // 2. Check environment variable
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }

    // 3. Fallback to system command
    return 'ffmpeg';
  }

  runFfmpeg(args) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      logger.info(`Running ffmpeg with args: ${args.slice(0, 8).join(' ')}...`);

      const proc = spawn(this.ffmpegPath, args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        if (code === 0) {
          logger.success(`FFmpeg command completed in ${durationMs}ms`);
          resolve({ success: true, durationMs });
        } else {
          logger.warn(`FFmpeg exited with code ${code}. Stderr: ${stderr.slice(-300)}`);
          resolve({
            success: false,
            exitCode: code,
            error: stderr.slice(-400) || 'FFmpeg failed to execute. Ensure ffmpeg is installed.'
          });
        }
      });

      proc.on('error', (err) => {
        logger.error('FFmpeg process launch error', err);
        resolve({
          success: false,
          error: `FFmpeg executable not found. Run bin/install-ffmpeg.bat or install ffmpeg to enable video rendering.`
        });
      });
    });
  }

  // 1. Video Trimming
  async trimVideo({ inputPath, outputPath, startTime = '00:00:00', duration = null, endTime = null }) {
    const finalOut = outputPath || path.join(this.outputDir, `trimmed_${Date.now()}.mp4`);
    const args = ['-y', '-ss', startTime, '-i', inputPath];

    if (duration) {
      args.push('-t', String(duration));
    } else if (endTime) {
      args.push('-to', endTime);
    }

    args.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', finalOut);
    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 2. Stitch / Concatenate Multiple Video Clips
  async concatenateVideos({ inputPaths, outputPath }) {
    if (!inputPaths || inputPaths.length === 0) {
      return { success: false, error: 'No input video paths provided' };
    }

    const finalOut = outputPath || path.join(this.outputDir, `merged_${Date.now()}.mp4`);
    const listFile = path.join(config.paths.logs, `concat_list_${Date.now()}.txt`);

    const fileContent = inputPaths
      .map(p => `file '${p.replace(/\\/g, '/')}'`)
      .join('\n');

    fs.writeFileSync(listFile, fileContent, 'utf8');

    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      finalOut
    ];

    const res = await this.runFfmpeg(args);
    try { fs.unlinkSync(listFile); } catch (e) {}

    return { ...res, outputPath: finalOut };
  }

  // 3. Animated Character Overlay (Picture-in-Picture with optional Chroma-Key Green Screen Removal)
  async overlayAnimatedCharacter({
    baseVideoPath,
    characterVideoPath,
    outputPath,
    position = 'bottom-right', // 'bottom-right', 'bottom-left', 'center', 'top-right'
    scalePct = 35, // character height as % of main video height
    chromaKeyColor = '0x00FF00', // green screen removal
    similarity = 0.3,
    blend = 0.1
  }) {
    const finalOut = outputPath || path.join(this.outputDir, `character_overlay_${Date.now()}.mp4`);

    // Coordinate mapping
    const posMap = {
      'bottom-right': 'main_w-overlay_w-20:main_h-overlay_h-20',
      'bottom-left': '20:main_h-overlay_h-20',
      'top-right': 'main_w-overlay_w-20:20',
      'top-left': '20:20',
      'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2'
    };

    const overlayCoord = posMap[position] || posMap['bottom-right'];

    // Filter complex for chroma key green removal + scaling + overlay
    const filterComplex = chromaKeyColor
      ? `[1:v]colorkey=${chromaKeyColor}:${similarity}:${blend},scale=-1:main_h*${scalePct / 100}[char];[0:v][char]overlay=${overlayCoord}:shortest=1[v]`
      : `[1:v]scale=-1:main_h*${scalePct / 100}[char];[0:v][char]overlay=${overlayCoord}:shortest=1[v]`;

    const args = [
      '-y',
      '-i', baseVideoPath,
      '-i', characterVideoPath,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '0:a?', // keep audio if present
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      finalOut
    ];

    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 4. Background Music & Voiceover Insertion
  async addAudioTrack({ videoPath, audioPath, outputPath, audioVolume = 0.8, mixWithOriginal = true }) {
    const finalOut = outputPath || path.join(this.outputDir, `audio_mixed_${Date.now()}.mp4`);

    let args = [];
    if (mixWithOriginal) {
      args = [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-filter_complex', `[0:a]volume=1.0[a0];[1:a]volume=${audioVolume}[a1];[a0][a1]amix=inputs=2:duration=first[a]`,
        '-map', '0:v',
        '-map', '[a]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        finalOut
      ];
    } else {
      args = [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        finalOut
      ];
    }

    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 5. Text & Subtitle Overlay
  async addTextOverlay({ videoPath, outputPath, text, fontSize = 32, fontColor = 'white', boxColor = 'black@0.6', position = 'bottom' }) {
    const finalOut = outputPath || path.join(this.outputDir, `captioned_${Date.now()}.mp4`);

    const yPos = position === 'bottom' ? 'h-th-40' : position === 'top' ? '40' : '(h-th)/2';
    const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');

    const drawtext = `drawtext=text='${escapedText}':fontcolor=${fontColor}:fontsize=${fontSize}:box=1:boxcolor=${boxColor}:boxborderw=8:x=(w-tw)/2:y=${yPos}`;

    const args = [
      '-y',
      '-i', videoPath,
      '-vf', drawtext,
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-preset', 'fast',
      finalOut
    ];

    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 6. Speed Modification
  async changeSpeed({ videoPath, outputPath, speedMultiplier = 1.5 }) {
    const finalOut = outputPath || path.join(this.outputDir, `speed_${speedMultiplier}x_${Date.now()}.mp4`);
    const ptsMultiplier = (1 / speedMultiplier).toFixed(4);

    const args = [
      '-y',
      '-i', videoPath,
      '-filter_complex', `[0:v]setpts=${ptsMultiplier}*PTS[v];[0:a]atempo=${speedMultiplier}[a]`,
      '-map', '[v]',
      '-map', '[a]',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      finalOut
    ];

    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 7. Convert Video to Animated GIF
  async convertToGif({ videoPath, outputPath, fps = 12, scaleWidth = 480 }) {
    const finalOut = outputPath || path.join(this.outputDir, `anim_${Date.now()}.gif`);

    const args = [
      '-y',
      '-i', videoPath,
      '-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      finalOut
    ];

    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }

  // 8. Extract Thumbnail / Character Keyframe
  async extractFrame({ videoPath, outputPath, timeOffset = '00:00:01' }) {
    const finalOut = outputPath || path.join(this.outputDir, `thumbnail_${Date.now()}.png`);
    const args = ['-y', '-ss', timeOffset, '-i', videoPath, '-vframes', '1', '-q:v', '2', finalOut];
    const res = await this.runFfmpeg(args);
    return { ...res, outputPath: finalOut };
  }
}

export const videoEditor = new VideoEditor();
