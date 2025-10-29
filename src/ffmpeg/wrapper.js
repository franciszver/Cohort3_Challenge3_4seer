const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function getFFmpegPath() {
  // If packaged, FFmpeg lives under process.resourcesPath/ffmpeg/ffmpeg.exe
  try {
    const electron = require('electron');
    if (electron.app && electron.app.isPackaged) {
      return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe');
    }
  } catch {
    // ignore
  }
  // Development path
  return path.join(__dirname, '..', '..', 'resources', 'ffmpeg', 'ffmpeg.exe');
}

function spawnPromise(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve(); else reject(new Error('FFmpeg exited with code ' + code));
    });
    proc.on('error', reject);
  });
}

let _exportCancellationFlag = false;

function cancelExport() {
  _exportCancellationFlag = true;
}

async function exportConcat(clips, outputPath, onProgress) {
  const tmpDir = path.join(os.tmpdir(), 'mvp_segments_' + Date.now());
  fs.mkdirSync(tmpDir);
  const segmentPathsCopy = [];
  const ffmpegPath = getFFmpegPath();
  let copyFailed = false;
  // reset cancellation flag at start
  _exportCancellationFlag = false;
  // notify start
  try { onProgress && onProgress({ segmentIndex: 0, total: clips.length, message: 'Starting export' }); } catch {}

  // First attempt: copy only
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const segPath = path.join(tmpDir, `segment_${i + 1}.mp4`);
    const hasTrim = typeof clip.inPoint === 'number' && typeof clip.outPoint === 'number' && clip.outPoint > clip.inPoint;
    try {
      const args = ['-y'];
      if (clip.path) {
        if (hasTrim) {
          args.push('-ss', String(clip.inPoint), '-to', String(clip.outPoint), '-i', clip.path);
        } else {
          args.push('-i', clip.path);
        }
        // Copy to avoid re-encoding for MVP
        args.push('-c', 'copy', segPath);
        await spawnPromise(ffmpegPath, args);
        segmentPathsCopy.push(segPath);
      }
    } catch (e) {
      if (_exportCancellationFlag) {
        throw new Error('Export canceled by user');
      }
      copyFailed = true;
      break;
    }
    // progress after each segment
    try { onProgress && onProgress({ segmentIndex: i + 1, total: clips.length, message: `Exported segment ${i + 1}/${clips.length}` }); } catch {}
  }

  let segmentPaths = segmentPathsCopy;
  // If any copy failed, retry with encoding (re-encode)
  if (copyFailed) {
    // Clean any partial segments
    for (const p of segmentPathsCopy) {
      try { fs.unlinkSync(p); } catch {}
    }
    // Re-run with encoding
    const segmentPathsEncoded = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const segPathEnc = path.join(tmpDir, `segment_${i + 1}.mp4`);
      const hasTrim = typeof clip.inPoint === 'number' && typeof clip.outPoint === 'number' && clip.outPoint > clip.inPoint;
      if (!clip.path) continue;
      const argsEnc = ['-y'];
      if (hasTrim) {
        argsEnc.push('-ss', String(clip.inPoint), '-to', String(clip.outPoint), '-i', clip.path);
      } else {
        argsEnc.push('-i', clip.path);
      }
      // Re-encode for broad compatibility
      argsEnc.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', segPathEnc);
      await spawnPromise(ffmpegPath, argsEnc);
      segmentPathsEncoded.push(segPathEnc);
    }
    segmentPaths = segmentPathsEncoded;
  }

  // Build concat input list
  const segmentsList = segmentPaths.map(p => `file '${p}'`).join('\n');
  const listPath = path.join(tmpDir, 'segments.txt');
  fs.writeFileSync(listPath, segmentsList);
  const finalPath = outputPath;
  const finalArgs = ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', finalPath];
  await spawnPromise(getFFmpegPath(), finalArgs);
  // final progress
  try { onProgress && onProgress({ segmentIndex: clips.length, total: clips.length, message: 'Export complete' }); } catch {}
  return finalPath;
}

/**
 * Extract thumbnails from a video file
 * @param {string} videoPath - Path to the video file
 * @param {string} outputDir - Directory to save thumbnails
 * @param {number} count - Number of thumbnails to extract
 * @param {number} duration - Video duration in seconds
 * @returns {Promise<string[]>} - Array of thumbnail file paths
 */
async function extractThumbnails(videoPath, outputDir, count, duration) {
  const ffmpegPath = getFFmpegPath();
  const thumbnails = [];
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Calculate interval between thumbnails
  const interval = duration / (count + 1);
  
  // Extract thumbnails at specific timestamps
  for (let i = 0; i < count; i++) {
    const timestamp = interval * (i + 1);
    const outputPath = path.join(outputDir, `thumb_${i}.jpg`);
    
    const args = [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-vf', 'scale=80:-1',
      outputPath
    ];
    
    try {
      await spawnPromise(ffmpegPath, args);
      thumbnails.push(outputPath);
    } catch (err) {
      console.error('Failed to extract thumbnail:', err);
    }
  }
  
  return thumbnails;
}

/**
 * Extract a single high-quality thumbnail from video for press kit
 * @param {string} videoPath - Path to the video file
 * @param {number} timestamp - Timestamp in seconds (default: midpoint or first 10%)
 * @returns {Promise<string>} - Path to the thumbnail file
 */
async function extractPressKitThumbnail(videoPath, timestamp = null) {
  const ffmpegPath = getFFmpegPath();
  const tempDir = path.join(os.tmpdir(), 'presskit_thumbs_' + Date.now());
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // If no timestamp provided, extract from first 10% of video
  // We'll need to get duration first, but for simplicity, just use 0.1 (first 10 seconds)
  const outputPath = path.join(tempDir, 'presskit_thumb.jpg');
  
  // If timestamp is provided, use it; otherwise default to 10% of video
  const ssValue = timestamp !== null ? String(timestamp) : '0.1';
  
  const args = [
    '-ss', ssValue,
    '-i', videoPath,
    '-vframes', '1',
    '-q:v', '2', // High quality
    '-vf', 'scale=1920:-1', // HD width, maintain aspect ratio
    '-y', // Overwrite output file
    outputPath
  ];
  
  try {
    await spawnPromise(ffmpegPath, args);
    return outputPath;
  } catch (err) {
    console.error('Failed to extract press kit thumbnail:', err);
    throw err;
  }
}

module.exports = { getFFmpegPath, exportConcat, cancelExport, extractThumbnails, extractPressKitThumbnail };


