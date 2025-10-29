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
  // Check if this is multi-track (has clips with track property)
  const hasMultiTrack = clips.some(clip => clip.track && clip.track === 2);
  
  if (hasMultiTrack) {
    return await exportMultiTrack(clips, outputPath, onProgress);
  }
  
  // Original single-track concatenation logic
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

// Multi-track export with overlay
async function exportMultiTrack(clips, outputPath, onProgress) {
  const ffmpegPath = getFFmpegPath();
  const tmpDir = path.join(os.tmpdir(), 'mvp_multitrack_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  _exportCancellationFlag = false;
  
  try { onProgress && onProgress({ segmentIndex: 0, total: 100, message: 'Processing multi-track export...' }); } catch {}
  
  // Separate clips by track
  const track1Clips = clips.filter(c => (c.track || 1) === 1);
  const track2Clips = clips.filter(c => (c.track || 1) === 2);
  
  // Calculate total timeline duration
  let totalDuration = 0;
  clips.forEach(clip => {
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    totalDuration = Math.max(totalDuration, clipStart + clipDuration);
  });
  
  // Handle cases: Track 2 only, Track 1 only, or both
  let hasTrack1 = track1Clips.length > 0;
  let hasTrack2 = track2Clips.length > 0;
  
  // If Track 2 only, export as full-screen (no overlay)
  if (!hasTrack1 && hasTrack2) {
    return await exportConcat(track2Clips, outputPath, onProgress);
  }
  
  // If Track 1 only, export normally
  if (hasTrack1 && !hasTrack2) {
    return await exportConcat(track1Clips, outputPath, onProgress);
  }
  
  // Both tracks: composite with overlay
  try { onProgress && onProgress({ segmentIndex: 10, total: 100, message: 'Creating base video from Track 1...' }); } catch {}
  
  // Step 1: Create base video from Track 1 with gaps filled
  const baseVideoPath = path.join(tmpDir, 'base_video.mp4');
  await createBaseVideoWithGaps(track1Clips, totalDuration, baseVideoPath, onProgress);
  
  try { onProgress && onProgress({ segmentIndex: 60, total: 100, message: 'Overlaying Track 2...' }); } catch {}
  
  // Step 2: Overlay Track 2 clips on base video
  const finalVideoPath = outputPath;
  await overlayTrack2(track2Clips, baseVideoPath, finalVideoPath, totalDuration, onProgress);
  
  try { onProgress && onProgress({ segmentIndex: 100, total: 100, message: 'Export complete!' }); } catch {}
  
  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.warn('Failed to cleanup temp directory:', err);
  }
  
  return finalVideoPath;
}

// Create base video from Track 1 clips with gaps filled with black
async function createBaseVideoWithGaps(track1Clips, totalDuration, outputPath, onProgress) {
  const ffmpegPath = getFFmpegPath();
  const tmpDir = path.dirname(outputPath);
  
  if (track1Clips.length === 0) {
    // No Track 1 clips - create black video
    const args = [
      '-y', '-f', 'lavfi',
      '-i', `color=c=black:s=1920x1080:d=${totalDuration}:r=30`,
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];
    await spawnPromise(ffmpegPath, args);
    return;
  }
  
  // Sort clips by startTime
  track1Clips.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  
  // Build complex filter: concat clips and fill gaps with black
  const filterParts = [];
  const inputArgs = [];
  let inputIndex = 0;
  let lastEndTime = 0;
  
  for (const clip of track1Clips) {
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    // Add gap (black) if needed before this clip
    if (clipStart > lastEndTime) {
      const gapDuration = clipStart - lastEndTime;
      inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=1920x1080:d=${gapDuration}:r=30`);
      filterParts.push(`[${inputIndex}:v]`);
      inputIndex++;
      lastEndTime = clipStart;
    }
    
    // Add clip
    const hasTrim = clip.outPoint > 0 && clip.outPoint > clip.inPoint;
    if (hasTrim) {
      inputArgs.push('-ss', String(clip.inPoint), '-to', String(clip.outPoint), '-i', clip.path);
    } else {
      inputArgs.push('-i', clip.path);
    }
    filterParts.push(`[${inputIndex}:v]`);
    inputIndex++;
    lastEndTime = clipEnd;
  }
  
  // Add final gap if needed
  if (lastEndTime < totalDuration) {
    const gapDuration = totalDuration - lastEndTime;
    inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=1920x1080:d=${gapDuration}:r=30`);
    filterParts.push(`[${inputIndex}:v]`);
    inputIndex++;
  }
  
  // Build concat filter
  const concatFilter = filterParts.join('') + `concat=n=${filterParts.length}:v=1:a=0[outv]`;
  
  // Build all filter parts
  const allFilterParts = [concatFilter];
  
  // Get audio from unmuted clips and build audio filter
  const audioInputIndices = [];
  let audioInputCount = 0;
  track1Clips.forEach((clip) => {
    if (!clip.muted && clip.path) {
      const clipInputIdx = inputIndex + audioInputCount;
      const hasTrim = clip.outPoint > 0 && clip.outPoint > clip.inPoint;
      if (hasTrim) {
        inputArgs.push('-ss', String(clip.inPoint), '-to', String(clip.outPoint), '-i', clip.path);
      } else {
        inputArgs.push('-i', clip.path);
      }
      audioInputIndices.push(clipInputIdx);
      audioInputCount++;
    }
  });
  
  // Mix audio if available
  if (audioInputIndices.length > 0) {
    const audioInputLabels = audioInputIndices.map(idx => `[${idx}:a]`).join('');
    const audioFilter = `${audioInputLabels}amix=inputs=${audioInputIndices.length}:duration=longest[outa]`;
    allFilterParts.push(audioFilter);
  }
  
  const allArgs = ['-y', ...inputArgs, '-filter_complex', allFilterParts.join(';')];
  
  // Map outputs
  allArgs.push('-map', '[outv]');
  if (audioInputIndices.length > 0) {
    allArgs.push('-map', '[outa]');
  }
  
  allArgs.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outputPath);
  
  await spawnPromise(ffmpegPath, allArgs);
}

// Overlay Track 2 clips on base video
async function overlayTrack2(track2Clips, baseVideoPath, outputPath, totalDuration, onProgress) {
  const ffmpegPath = getFFmpegPath();
  
  if (track2Clips.length === 0) {
    // No Track 2 clips - just copy base video
    const args = ['-y', '-i', baseVideoPath, '-c', 'copy', outputPath];
    await spawnPromise(ffmpegPath, args);
    return;
  }
  
  // Sort Track 2 clips by startTime
  track2Clips.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  
  // Build overlay filter chain for each Track 2 clip
  const inputArgs = ['-i', baseVideoPath];
  let inputIndex = 1;
  let currentVideoLabel = '0:v';
  const filterParts = [];
  
  for (let i = 0; i < track2Clips.length; i++) {
    const clip = track2Clips[i];
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const hasTrim = clip.outPoint > 0 && clip.outPoint > clip.inPoint;
    
    if (hasTrim) {
      inputArgs.push('-ss', String(clip.inPoint), '-to', String(clip.outPoint), '-i', clip.path);
    } else {
      inputArgs.push('-i', clip.path);
    }
    
    // Scale Track 2 to 25% width (PIP)
    const pipLabel = `pip${i}`;
    const scaleFilter = `[${inputIndex}:v]scale=iw*0.25:-1[${pipLabel}]`;
    filterParts.push(scaleFilter);
    
    // Overlay at bottom-right with 10px padding
    // Chain overlays: use output from previous as input
    const outputLabel = i === track2Clips.length - 1 ? 'finalv' : `v${i}`;
    const overlayFilter = `[${currentVideoLabel}][${pipLabel}]overlay=W-w-10:H-h-10:enable='between(t,${clipStart},${clipStart + clipDuration})'[${outputLabel}]`;
    filterParts.push(overlayFilter);
    
    currentVideoLabel = outputLabel;
    inputIndex++;
  }
  
  // Combine all filters
  const filterComplex = filterParts.join(';');
  const finalVideoLabel = track2Clips.length > 0 ? 'finalv' : '0:v';
  
  // Build command
  const args = ['-y', ...inputArgs];
  
  if (track2Clips.length > 0) {
    args.push('-filter_complex', filterComplex);
    args.push('-map', `[${finalVideoLabel}]`);
  } else {
    args.push('-map', '0:v');
  }
  
  // Audio: use base video audio (Track 1 audio already mixed)
  args.push('-map', '0:a');
  
  args.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outputPath);
  
  await spawnPromise(ffmpegPath, args);
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


