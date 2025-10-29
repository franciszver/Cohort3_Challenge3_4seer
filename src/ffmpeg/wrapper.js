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
  // Debug: log the command for troubleshooting
  console.log('FFmpeg command:', cmd);
  console.log('FFmpeg args:', args.join(' '));
  
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error('FFmpeg failed with code:', code);
        console.error('Command was:', cmd, args.join(' '));
        reject(new Error('FFmpeg exited with code ' + code));
      }
    });
    proc.on('error', (err) => {
      console.error('FFmpeg spawn error:', err);
      reject(err);
    });
  });
}

let _exportCancellationFlag = false;

function cancelExport() {
  _exportCancellationFlag = true;
}

// Helper function to probe video resolution using ffprobe
async function probeVideoResolution(videoPath) {
  const ffprobePath = getFFmpegPath().replace('ffmpeg.exe', 'ffprobe.exe');
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      videoPath
    ];
    
    const proc = spawn(ffprobePath, args);
    let stdout = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', () => {}); // Ignore stderr
    
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          if (result.streams && result.streams[0]) {
            resolve({
              width: result.streams[0].width,
              height: result.streams[0].height
            });
            return;
          }
        } catch (e) {
          // Fall through to default
        }
      }
      // Default fallback if probe fails
      resolve({ width: 1920, height: 1080 });
    });
    
    proc.on('error', () => {
      resolve({ width: 1920, height: 1080 });
    });
  });
}

async function exportConcat(clips, outputPath, resolution = 'source', onProgress) {
  // Check if this is multi-track (has clips with track property)
  const hasMultiTrack = clips.some(clip => clip.track && clip.track === 2);
  
  if (hasMultiTrack) {
    return await exportMultiTrack(clips, outputPath, resolution, onProgress);
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

  // Determine if we need to scale (resolution is not 'source')
  const needsScaling = resolution !== 'source';
  let scaleFilter = null;
  if (needsScaling) {
    if (resolution === '720p') {
      scaleFilter = 'scale=1280:-2';
    } else if (resolution === '1080p') {
      scaleFilter = 'scale=1920:-2';
    }
  }

  // First attempt: copy only (only if no scaling needed)
  if (!needsScaling) {
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
  }

  let segmentPaths = segmentPathsCopy;
  // If any copy failed, or scaling is needed, retry with encoding (re-encode)
  if (copyFailed || needsScaling) {
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
      // Add scale filter if resolution scaling is needed
      if (scaleFilter) {
        argsEnc.push('-vf', scaleFilter);
      }
      argsEnc.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', segPathEnc);
      await spawnPromise(ffmpegPath, argsEnc);
      segmentPathsEncoded.push(segPathEnc);
    }
    segmentPaths = segmentPathsEncoded;
  }

  // If we only have one segment, we can just copy it directly (no concat needed)
  if (segmentPaths.length === 1) {
    // Single segment - just copy it to output (scaling already done if needed)
    const finalPath = outputPath;
    fs.copyFileSync(segmentPaths[0], finalPath);
    try { onProgress && onProgress({ segmentIndex: clips.length, total: clips.length, message: 'Export complete' }); } catch {}
    return finalPath;
  } else {
    // Multiple segments - need to concatenate
    // Normalize paths for FFmpeg concat (use forward slashes and escape single quotes)
    const segmentsList = segmentPaths.map(p => {
      const normalizedPath = p.replace(/\\/g, '/').replace(/'/g, "\\'");
      return `file '${normalizedPath}'`;
    }).join('\n');
    const listPath = path.join(tmpDir, 'segments.txt');
    fs.writeFileSync(listPath, segmentsList);
    
    // All segments are already at the correct resolution (scaled if needed), so concat with copy
    const finalArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath];
    try {
      await spawnPromise(getFFmpegPath(), finalArgs);
    } catch (e) {
      // If copy fails (e.g., codec mismatch), re-encode during concat
      const finalArgsReencode = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outputPath];
      await spawnPromise(getFFmpegPath(), finalArgsReencode);
    }
    const finalPath = outputPath;
    // final progress
    try { onProgress && onProgress({ segmentIndex: clips.length, total: clips.length, message: 'Export complete' }); } catch {}
    return finalPath;
  }
}

// Multi-track export with overlay
async function exportMultiTrack(clips, outputPath, resolution = 'source', onProgress) {
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
    return await exportConcat(track2Clips, outputPath, resolution, onProgress);
  }
  
  // If Track 1 only, export normally
  if (hasTrack1 && !hasTrack2) {
    return await exportConcat(track1Clips, outputPath, resolution, onProgress);
  }
  
  // Both tracks: composite with overlay
  try { onProgress && onProgress({ segmentIndex: 10, total: 100, message: 'Creating base video from Track 1...' }); } catch {}
  
  // Step 1: Create base video from Track 1 with gaps filled
  const baseVideoPath = path.join(tmpDir, 'base_video.mp4');
  await createBaseVideoWithGaps(track1Clips, totalDuration, baseVideoPath, resolution, onProgress);
  
  try { onProgress && onProgress({ segmentIndex: 60, total: 100, message: 'Overlaying Track 2...' }); } catch {}
  
  // Step 2: Overlay Track 2 clips on base video
  const finalVideoPath = outputPath;
  await overlayTrack2(track2Clips, baseVideoPath, finalVideoPath, totalDuration, resolution, onProgress);
  
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
async function createBaseVideoWithGaps(track1Clips, totalDuration, outputPath, resolution = 'source', onProgress) {
  const ffmpegPath = getFFmpegPath();
  const tmpDir = path.dirname(outputPath);
  
  // Determine target resolution - probe first clip if source
  let targetWidth = 1920;
  let targetHeight = 1080;
  
  if (resolution === '720p') {
    targetWidth = 1280;
    targetHeight = 720;
  } else if (resolution === '1080p') {
    targetWidth = 1920;
    targetHeight = 1080;
  } else if (resolution === 'source' && track1Clips.length > 0) {
    // Probe first clip to get source resolution
    const firstClip = track1Clips.find(c => c.path);
    if (firstClip && firstClip.path) {
      const res = await probeVideoResolution(firstClip.path);
      targetWidth = res.width;
      targetHeight = res.height;
    }
  }
  
  if (track1Clips.length === 0) {
    // No Track 1 clips - create black video
    const args = [
      '-y', '-f', 'lavfi',
      '-i', `color=c=black:s=${targetWidth}x${targetHeight}:d=${totalDuration}:r=30`,
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
      inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=${targetWidth}x${targetHeight}:d=${gapDuration}:r=30`);
      // Gap is already at target resolution, no scaling needed - will be added to concatLabels
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
    // Scale video clip to target resolution before concat
    const scaledLabel = `scaled${inputIndex}`;
    filterParts.push(`[${inputIndex}:v]scale=${targetWidth}:${targetHeight}[${scaledLabel}]`);
    inputIndex++;
    lastEndTime = clipEnd;
  }
  
  // Build concatLabels - use direct input for gaps, scaled labels for clips
  const concatLabels = [];
  let concatIdx = 0;
  lastEndTime = 0;
  
  for (const clip of track1Clips) {
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    // Gap label (already at target resolution)
    if (clipStart > lastEndTime) {
      concatLabels.push(`[${concatIdx}:v]`);
      concatIdx++;
      lastEndTime = clipStart;
    }
    
    // Scaled clip label - use same input index as where we added the scale filter
    concatLabels.push(`[scaled${concatIdx}]`);
    concatIdx++;
    lastEndTime = clipEnd;
  }
  
  // Add final gap if needed
  if (lastEndTime < totalDuration) {
    const gapDuration = totalDuration - lastEndTime;
    inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=${targetWidth}x${targetHeight}:d=${gapDuration}:r=30`);
    concatLabels.push(`[${concatIdx}:v]`);
  }
  
  // Build concat filter using concatLabels (gaps use direct input, clips use scaled labels)
  const concatFilter = concatLabels.join('') + `concat=n=${concatLabels.length}:v=1:a=0[outv]`;
  
  // Build all filter parts - combine scale filters (filterParts) with concat
  const allFilterParts = [...filterParts, concatFilter];
  
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
async function overlayTrack2(track2Clips, baseVideoPath, outputPath, totalDuration, resolution = 'source', onProgress) {
  const ffmpegPath = getFFmpegPath();
  
  if (track2Clips.length === 0) {
    // No Track 2 clips - just copy base video with optional scaling
    const args = ['-y', '-i', baseVideoPath];
    if (resolution === '720p') {
      args.push('-vf', 'scale=1280:-2');
    } else if (resolution === '1080p') {
      args.push('-vf', 'scale=1920:-2');
    }
    if (resolution === 'source') {
      args.push('-c', 'copy', outputPath);
    } else {
      args.push('-c:v', 'libx264', '-c:a', 'copy', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outputPath);
    }
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
  
  // Combine all filters and apply resolution scaling if needed
  let filterComplex = filterParts.length > 0 ? filterParts.join(';') : '';
  let finalVideoLabel = track2Clips.length > 0 ? 'finalv' : '0:v';
  
  // Build command
  const args = ['-y', ...inputArgs];
  
  // Apply resolution scaling if needed (before building args)
  if (resolution === '720p' || resolution === '1080p') {
    const scaleFilter = resolution === '720p' ? 'scale=1280:-2' : 'scale=1920:-2';
    if (track2Clips.length > 0 && filterComplex) {
      // Add scale filter to the end of filter chain
      const scaledLabel = 'scaledv';
      filterComplex = `${filterComplex};[${finalVideoLabel}]${scaleFilter}[${scaledLabel}]`;
      finalVideoLabel = scaledLabel;
      args.push('-filter_complex', filterComplex);
      args.push('-map', `[${finalVideoLabel}]`);
    } else if (track2Clips.length > 0) {
      // No existing filters, just scale
      args.push('-filter_complex', `[0:v]${scaleFilter}[${finalVideoLabel}]`);
      args.push('-map', `[${finalVideoLabel}]`);
    } else {
      // No overlays, use -vf for scaling
      args.push('-map', '0:v');
      args.push('-vf', scaleFilter);
    }
  } else {
    // No resolution scaling
    if (track2Clips.length > 0 && filterComplex) {
      args.push('-filter_complex', filterComplex);
      args.push('-map', `[${finalVideoLabel}]`);
    } else {
      args.push('-map', '0:v');
    }
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


