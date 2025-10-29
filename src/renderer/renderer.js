"use strict";

const { ipcRenderer } = require('electron');

// Data model: separate imported clips from timeline clips
let importedClips = []; // Clips in the media library
let timelineClips = []; // Clips on the timeline
let selectedClipIndex = null;
let timelineZoom = 50; // pixels per second (default - will auto-adjust to fill screen)
let timelineCurrentTime = 0; // Global timeline position (seconds)
const DEFAULT_FRAME_RATE = 30; // FPS for timecode display

// Recording state management
let recordingState = {
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
  startTime: null,
  liveClipId: null,
  streams: { desktop: null, webcam: null, audio: null },
  canvas: null,
  canvasStream: null,
  audioContext: null,
  analyser: null,
  timerInterval: null,
  updateInterval: null,
  recordingPreviewFrame: null
};

// DOM refs
const dropzone = document.getElementById('dropzone');
const projectFilesList = document.getElementById('project-files-list');
const track1Content = document.getElementById('track-1-content');
const track2Content = document.getElementById('track-2-content');
const timelineScrollWrapper = document.getElementById('timeline-scroll-wrapper');
const trackContent = track1Content; // Backward compatibility
const videoEl = document.getElementById('video');
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const inPointInput = document.getElementById('inPointInput');
const outPointInput = document.getElementById('outPointInput');
const applyTrimBtn = document.getElementById('applyTrimBtn');
const deleteClipBtn = document.getElementById('deleteClipBtn');
const muteClipBtn = document.getElementById('muteClipBtn');
const trackInfoDisplay = document.getElementById('trackInfoDisplay');
const exportBtn = document.getElementById('exportBtn');
const exportStatusEl = document.getElementById('exportStatus');
const exportProgressBar = document.getElementById('exportProgressBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const forwardBtn = document.getElementById('forwardBtn');
const playhead = document.getElementById('playhead');
const timelineRuler = document.getElementById('timeline-ruler');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const audioOutputSelect = document.getElementById('audioOutputSelect');

// Recording DOM refs - will be initialized after DOM loads
let recordBtn, recordingModal, closeRecordingModal, desktopSourceSelect, webcamSourceSelect, microphoneSourceSelect, webcamToggle, startRecordingBtn, recordingTimer, recordingIndicator;

// Context menu state
let contextMenu = null;
let contextMenuClipIndex = null;
let contextMenuTimelineTime = null;

// File input for click-to-select
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'video/mp4,video/quicktime';
fileInput.multiple = true;
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

function setExportStatus(message, color) {
  if (!exportStatusEl) return;
  exportStatusEl.textContent = message;
  exportStatusEl.style.color = color || '#999';
}

// Get video duration helper
async function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      resolve(tempVideo.duration);
      tempVideo.remove();
    };
    tempVideo.onerror = () => {
      resolve(10); // Default fallback duration
      tempVideo.remove();
    };
    tempVideo.src = videoPath;
  });
}

// Render Project Files (media library)
function renderProjectFiles() {
  projectFilesList.innerHTML = '';
  importedClips.forEach((clip, idx) => {
    const el = document.createElement('div');
    el.className = 'library-clip';
    el.draggable = true;
    el.dataset.clipId = clip.id;
    
    const icon = document.createElement('div');
    icon.className = 'library-clip-icon';
    icon.textContent = '🎬';
    
    const name = document.createElement('div');
    name.className = 'library-clip-name';
    name.textContent = clip.name || `Clip ${idx + 1}`;
    name.title = clip.originalPath || clip.path;
    
    el.appendChild(icon);
    el.appendChild(name);
    
    // Drag from library to timeline
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', clip.id);
      el.classList.add('dragging');
    });
    
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });
    
    projectFilesList.appendChild(el);
  });
}

// Render Timeline
function renderTimeline() {
  // Clear existing clips from both tracks (but keep playhead)
  const existingClipsTrack1 = track1Content.querySelectorAll('.timeline-clip');
  existingClipsTrack1.forEach(el => el.remove());
  const existingClipsTrack2 = track2Content.querySelectorAll('.timeline-clip');
  existingClipsTrack2.forEach(el => el.remove());
  
  // Render clips on their respective tracks
  timelineClips.forEach((clip, idx) => {
    const track = clip.track || 1; // Default to track 1 if not set
    const targetTrackContent = track === 1 ? track1Content : track2Content;
    
    const duration = clip.duration || 10;
    const trimmedDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : duration;
    const width = trimmedDuration * timelineZoom;
    
    const el = document.createElement('div');
    el.className = 'timeline-clip';
    if (track === 2) {
      el.classList.add('track-2-clip'); // Distinct styling for overlay track
    }
    if (clip.muted) {
      el.classList.add('muted-clip'); // Visual indication for muted clips
    }
    if (selectedClipIndex === idx) {
      el.classList.add('selected');
    }
    el.dataset.clipId = clip.id;
    el.dataset.clipIndex = idx;
    el.style.width = width + 'px';
    el.style.left = (clip.startTime || 0) * timelineZoom + 'px';
    
    // Thumbnail container
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'timeline-clip-thumbnails';
    
    // Display thumbnails if available
    if (clip.thumbnails && clip.thumbnails.length > 0) {
      const thumbnailCount = clip.thumbnails.length;
      const thumbnailWidth = width / thumbnailCount;
      clip.thumbnails.forEach(thumbPath => {
        const img = document.createElement('img');
        img.className = 'timeline-clip-thumbnail';
        img.src = thumbPath;
        img.style.width = thumbnailWidth + 'px';
        img.style.flexShrink = '0';
        thumbContainer.appendChild(img);
      });
    } else if (clip.thumbnailsLoading) {
      // Show loading indicator
      thumbContainer.style.display = 'flex';
      thumbContainer.style.alignItems = 'center';
      thumbContainer.style.justifyContent = 'center';
      thumbContainer.style.color = '#999';
      thumbContainer.style.fontSize = '11px';
      thumbContainer.textContent = 'Loading...';
    }
    
    el.appendChild(thumbContainer);
    
    // Audio waveform container
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'timeline-clip-waveform';
    waveformContainer.style.position = 'absolute';
    waveformContainer.style.bottom = '0';
    waveformContainer.style.left = '0';
    waveformContainer.style.width = '100%';
    waveformContainer.style.height = '20px';
    waveformContainer.style.background = 'rgba(0, 0, 0, 0.3)';
    
    if (clip.audioWaveform && clip.audioWaveform.length > 0) {
      renderWaveform(waveformContainer, clip.audioWaveform, width);
    } else if (!clip.isLive && clip.path) {
      // Generate waveform for non-live clips
      generateAudioWaveform(clip);
    }
    
    el.appendChild(waveformContainer);
    
    // Label
    const label = document.createElement('div');
    label.className = 'timeline-clip-label';
    label.textContent = clip.name || `Clip ${idx + 1}`;
    el.appendChild(label);
    
    // Resize handles
    const leftHandle = document.createElement('div');
    leftHandle.className = 'timeline-clip-resize-handle left';
    el.appendChild(leftHandle);
    
    const rightHandle = document.createElement('div');
    rightHandle.className = 'timeline-clip-resize-handle right';
    el.appendChild(rightHandle);
    
    // Click to select
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('timeline-clip-resize-handle')) return;
      selectTimelineClip(idx);
    });
    
    targetTrackContent.appendChild(el);
  });
  
  renderTimelineRuler();
}

// Preview compositing state
let previewState = {
  track1Video: null,
  track2Video: null,
  track1Clip: null,
  track2Clip: null,
  animationFrame: null,
  lastTime: 0
};

// Timeline playback state
let timelinePlaybackState = {
  isPlaying: false,
  playbackStartTime: 0,
  playbackStartPosition: 0,
  lastFrameTime: null
};

// Find active clip at timeline time for a specific track
function findActiveClipAtTime(trackNum, time) {
  const trackClips = timelineClips.filter(clip => (clip.track || 1) === trackNum);
  
  for (const clip of trackClips) {
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    if (time >= clipStart && time < clipEnd) {
      return clip;
    }
  }
  return null;
}

// Update composite preview based on current timeline time
function updateCompositePreview() {
  if (!previewCanvas || !previewCtx) return;
  
  const currentTime = timelineCurrentTime || 0;
  
  // Find active clips on both tracks
  const track1Clip = findActiveClipAtTime(1, currentTime);
  const track2Clip = findActiveClipAtTime(2, currentTime);
  
  // Ensure existing clips have track property (backward compatibility)
  timelineClips.forEach(clip => {
    if (!clip.hasOwnProperty('track')) {
      clip.track = 1; // Default to Track 1
    }
  });
  
  // Update video elements if clips changed
  if (track1Clip !== previewState.track1Clip) {
    previewState.track1Clip = track1Clip;
    if (track1Clip) {
      if (!previewState.track1Video) {
        previewState.track1Video = document.createElement('video');
        previewState.track1Video.muted = track1Clip.muted || false;
        previewState.track1Video.addEventListener('loadedmetadata', () => {
          setupCanvasSize();
          drawCompositeFrame();
        });
      }
      previewState.track1Video.src = track1Clip.path;
      previewState.track1Video.muted = track1Clip.muted || false;
      previewState.track1Video.load();
    } else {
      if (previewState.track1Video) {
        previewState.track1Video.pause();
        previewState.track1Video.src = '';
      }
    }
  }
  
  if (track2Clip !== previewState.track2Clip) {
    previewState.track2Clip = track2Clip;
    if (track2Clip) {
      if (!previewState.track2Video) {
        previewState.track2Video = document.createElement('video');
        previewState.track2Video.muted = track2Clip.muted || false;
        previewState.track2Video.addEventListener('loadedmetadata', () => {
          setupCanvasSize();
          drawCompositeFrame();
        });
      }
      previewState.track2Video.src = track2Clip.path;
      previewState.track2Video.muted = track2Clip.muted || false;
      previewState.track2Video.load();
    } else {
      if (previewState.track2Video) {
        previewState.track2Video.pause();
        previewState.track2Video.src = '';
      }
    }
  }
  
  // Update video playback positions
  if (track1Clip && previewState.track1Video) {
    const clipStart = track1Clip.startTime || 0;
    const clipLocalTime = currentTime - clipStart;
    const videoTime = clipLocalTime + (track1Clip.inPoint || 0);
    
    if (Math.abs(previewState.track1Video.currentTime - videoTime) > 0.1) {
      previewState.track1Video.currentTime = videoTime;
    }
    
    if (previewState.track1Video.paused && timelinePlaybackState.isPlaying) {
      previewState.track1Video.play().catch(() => {
        // Ignore play() interruptions
      });
    } else if (!previewState.track1Video.paused && !timelinePlaybackState.isPlaying) {
      try {
        previewState.track1Video.pause();
      } catch (e) {
        // Ignore pause errors
      }
    }
  }
  
  if (track2Clip && previewState.track2Video) {
    const clipStart = track2Clip.startTime || 0;
    const clipLocalTime = currentTime - clipStart;
    const videoTime = clipLocalTime + (track2Clip.inPoint || 0);
    
    if (Math.abs(previewState.track2Video.currentTime - videoTime) > 0.1) {
      previewState.track2Video.currentTime = videoTime;
    }
    
    if (previewState.track2Video.paused && timelinePlaybackState.isPlaying) {
      previewState.track2Video.play().catch(() => {
        // Ignore play() interruptions
      });
    } else if (!previewState.track2Video.paused && !timelinePlaybackState.isPlaying) {
      try {
        previewState.track2Video.pause();
      } catch (e) {
        // Ignore pause errors
      }
    }
  }
  
  // Draw composite frame continuously
  drawCompositeFrame();
  previewState.lastTime = currentTime;
}

// Setup canvas size to match container
function setupCanvasSize() {
  if (!previewCanvas) return;
  const container = previewCanvas.parentElement;
  const width = container.clientWidth;
  const height = container.clientHeight;
  previewCanvas.width = width;
  previewCanvas.height = height;
}

// Draw composite frame (Track 1 + Track 2 PIP overlay)
function drawCompositeFrame() {
  if (!previewCtx || !previewCanvas) return;
  
  // Ensure canvas is sized
  if (previewCanvas.width === 0 || previewCanvas.height === 0) {
    setupCanvasSize();
  }
  
  const width = previewCanvas.width;
  const height = previewCanvas.height;
  
  if (width === 0 || height === 0) return;
  
  // Clear canvas
  previewCtx.fillStyle = '#000';
  previewCtx.fillRect(0, 0, width, height);
  
  // During recording, show the live recording stream instead of timeline clips
  if (recordingState.isRecording && videoEl && videoEl.srcObject) {
    // Ensure video is playing
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
    }
    
    // Wait for video to be ready, but still try to draw even if readyState < 2
    if (videoEl.readyState >= 1 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      const aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
      let drawWidth = width;
      let drawHeight = height;
      
      // Maintain aspect ratio
      if (width / height > aspectRatio) {
        drawWidth = height * aspectRatio;
      } else {
        drawHeight = width / aspectRatio;
      }
      
      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;
      
      // Draw the current frame from the video element
      previewCtx.drawImage(videoEl, x, y, drawWidth, drawHeight);
      return; // Exit early, don't draw timeline clips during recording
    }
  }
  
  // Draw Track 1 (main) if available
  if (previewState.track1Video && previewState.track1Video.readyState >= 2 && previewState.track1Video.videoWidth > 0) {
    const video1 = previewState.track1Video;
    const aspectRatio = video1.videoWidth / video1.videoHeight;
    let drawWidth = width;
    let drawHeight = height;
    
    // Maintain aspect ratio
    if (width / height > aspectRatio) {
      drawWidth = height * aspectRatio;
    } else {
      drawHeight = width / aspectRatio;
    }
    
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    
    previewCtx.drawImage(video1, x, y, drawWidth, drawHeight);
  }
  
  // Draw Track 2 (PIP overlay) if available
  if (previewState.track2Video && previewState.track2Video.readyState >= 2 && previewState.track2Video.videoWidth > 0) {
    const video2 = previewState.track2Video;
    const pipWidth = width * 0.25; // 25% of canvas width
    const pipHeight = (video2.videoHeight / video2.videoWidth) * pipWidth; // Maintain aspect ratio
    const pipPadding = 10;
    const pipX = width - pipWidth - pipPadding; // Bottom-right
    const pipY = height - pipHeight - pipPadding;
    
    previewCtx.drawImage(video2, pipX, pipY, pipWidth, pipHeight);
  }
  
  // Continue animation loop for smooth playback
  if (previewState.animationFrame) {
    previewState.animationFrame = requestAnimationFrame(() => {
      drawCompositeFrame();
      if (!videoEl.paused) {
        updateCompositePreview();
      }
    });
  }
}

// Select a timeline clip
function selectTimelineClip(idx) {
  selectedClipIndex = idx;
  const clip = timelineClips[idx];
  if (!clip) return;
  
  // Update properties panel
  const track = clip.track || 1;
  if (trackInfoDisplay) {
    trackInfoDisplay.textContent = track === 1 ? 'Track 1 - Main' : 'Track 2 - Overlay';
  }
  if (inPointInput) inPointInput.value = clip.inPoint || 0;
  if (outPointInput) outPointInput.value = clip.outPoint || clip.duration || 0;
  if (muteClipBtn) {
    muteClipBtn.textContent = clip.muted ? 'Unmute Clip' : 'Mute Clip';
    muteClipBtn.classList.toggle('muted', clip.muted);
  }
  
  // Update visual selection (clear all, then select current)
  track1Content.querySelectorAll('.timeline-clip').forEach(el => {
    el.classList.remove('selected');
  });
  track2Content.querySelectorAll('.timeline-clip').forEach(el => {
    el.classList.remove('selected');
  });
  const selectedEl1 = track1Content.querySelector(`[data-clip-index="${idx}"]`);
  const selectedEl2 = track2Content.querySelector(`[data-clip-index="${idx}"]`);
  const selectedEl = selectedEl1 || selectedEl2;
  if (selectedEl) {
    selectedEl.classList.add('selected');
  }
  
  // Update composite preview
  updateCompositePreview();
}

// Format timecode based on zoom level and frame rate
function formatTimecode(seconds, zoomLevel, frameRate = DEFAULT_FRAME_RATE) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  // Adaptive precision based on zoom level
  if (zoomLevel < 20) {
    // Very zoomed out: show only MM:SS
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else if (zoomLevel < 50) {
    // Medium zoom: show HH:MM:SS
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else if (zoomLevel < 100) {
    // Zoomed in: show HH:MM:SS:FF (frame-based, SMPTE standard)
    const frames = Math.floor((seconds % 1) * frameRate);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  } else {
    // Very zoomed in: show HH:MM:SS:FF with sub-frame precision
    const frames = Math.floor((seconds % 1) * frameRate);
    const subFrame = Math.floor(((seconds % 1) * frameRate % 1) * 10);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}.${subFrame}`;
  }
}

// Render timeline ruler with improved timecode display
function renderTimelineRuler() {
  // Re-query the element in case it wasn't available at script load time
  const ruler = timelineRuler || document.getElementById('timeline-ruler');
  if (!ruler) {
    console.warn('timelineRuler element not found!');
    return;
  }
  ruler.innerHTML = '';
  
  // Calculate total timeline duration
  let totalDuration = 0;
  timelineClips.forEach(clip => {
    const clipEnd = (clip.startTime || 0) + (clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : (clip.duration || 10));
    totalDuration = Math.max(totalDuration, clipEnd);
  });
  
  // Ensure minimum duration for empty timeline or very short projects
  const minDuration = 30; // At least 30 seconds
  totalDuration = Math.max(totalDuration, minDuration);
  
  // Add padding beyond content for better scrolling (10 seconds worth)
  totalDuration += 10;
  
  // Determine marker interval based on zoom to prevent overlap
  // Increased minimum spacing to 120px for better readability (prevents squishing)
  const minPixelSpacing = 120;
  const calculatedInterval = minPixelSpacing / timelineZoom;
  
  let interval = 1; // seconds
  let majorInterval = 10; // Major markers every 10 seconds
  if (calculatedInterval > 5) {
    interval = 5;
    majorInterval = 30;
  } else if (calculatedInterval > 2) {
    interval = 2;
    majorInterval = 10;
  } else if (calculatedInterval > 1) {
    interval = 1;
    majorInterval = 5;
  } else if (calculatedInterval > 0.5) {
    interval = 0.5;
    majorInterval = 2;
  } else if (calculatedInterval > 0.1) {
    interval = 0.1;
    majorInterval = 1;
  } else {
    interval = 0.05;
    majorInterval = 0.5;
  }
  
  // Determine sub-intervals for frame-level precision when zoomed in
  let subInterval = null;
  if (timelineZoom >= 100) {
    subInterval = 1 / DEFAULT_FRAME_RATE; // One frame at 30fps
  }
  
  // Track marker positions to prevent overlap
  const markerPositions = new Set();
  
  for (let t = 0; t <= totalDuration; t += interval) {
    const pixelPos = t * timelineZoom;
    
    // Skip if too close to a previous marker (prevent squishing)
    let tooClose = false;
    for (const pos of markerPositions) {
      if (Math.abs(pixelPos - pos) < minPixelSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    
    markerPositions.add(pixelPos);
    const isMajorMarker = Math.abs(t % majorInterval) < 0.001; // Check if on major interval
    
    const marker = document.createElement('div');
    marker.className = isMajorMarker ? 'ruler-marker major' : 'ruler-marker';
    marker.style.left = pixelPos + 'px';
    
    // Format timecode with adaptive precision
    marker.textContent = formatTimecode(t, timelineZoom);
    
    ruler.appendChild(marker);
  }
  
  // Add sub-frame markers if very zoomed in (only if not too dense)
  if (subInterval && timelineZoom >= 100 && interval >= 0.1) {
    for (let t = 0; t <= totalDuration; t += subInterval) {
      const pixelPos = t * timelineZoom;
      
      // Skip if too close to existing markers
      let tooClose = false;
      for (const pos of markerPositions) {
        if (Math.abs(pixelPos - pos) < 15) { // Smaller threshold for sub-markers
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      
      const subMarker = document.createElement('div');
      subMarker.className = 'ruler-marker sub';
      subMarker.style.left = pixelPos + 'px';
      ruler.appendChild(subMarker);
    }
  }
  
  // Set minimum width - ensure it extends at least to viewport width plus buffer
  const viewportWidth = timelineScrollWrapper ? timelineScrollWrapper.clientWidth : window.innerWidth;
  const contentWidth = totalDuration * timelineZoom;
  const minWidth = Math.max(contentWidth, viewportWidth + 1000); // Viewport + 1000px buffer for smooth scrolling
  ruler.style.minWidth = minWidth + 'px';
  ruler.style.width = minWidth + 'px'; // Explicit width for visibility
  
  // Also update track content widths to match (so they extend full length too)
  if (track1Content && track2Content) {
    track1Content.style.minWidth = minWidth + 'px';
    track2Content.style.minWidth = minWidth + 'px';
  }
}

// Add clip from file to media library
async function addClipFromFile(filePath) {
  try {
    const result = await ipcRenderer.invoke('import-file', filePath);
    if (!result || !result.success) {
      console.error('Failed to import file:', result?.error);
      return;
    }
    
    const duration = await getVideoDuration(result.tempPath);
    const fileName = result.originalPath.split(/[\\/]/).pop();
    
    const clip = { 
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      path: result.tempPath, 
      originalPath: result.originalPath,
      name: fileName,
      duration: duration,
      inPoint: 0, 
      outPoint: duration,
    };
    
    importedClips.push(clip);
    renderProjectFiles();
  } catch (err) {
    console.error('Error adding clip:', err);
  }
}

// Add clip from library to timeline
async function addClipToTimeline(clipId, track = 1, startTime = null) {
  const sourceClip = importedClips.find(c => c.id === clipId);
  if (!sourceClip) return;
  
  // If startTime not provided, place at playhead or 0
  if (startTime === null) {
    startTime = timelineCurrentTime || 0;
  }
  
  // Create timeline clip (copy from source)
  const timelineClip = {
    id: 'timeline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    sourceId: sourceClip.id,
    path: sourceClip.path,
    originalPath: sourceClip.originalPath,
    name: sourceClip.name,
    duration: sourceClip.duration,
    inPoint: 0,
    outPoint: sourceClip.duration,
    startTime: startTime,
    track: track, // 1 = main, 2 = overlay
    muted: false, // Default to unmuted
    thumbnails: [],
    thumbnailsLoading: true,
  };
  
  timelineClips.push(timelineClip);
  renderTimeline();
  
  // Auto-select first clip added to timeline
  if (selectedClipIndex == null) {
    const newIndex = timelineClips.length - 1;
    selectTimelineClip(newIndex);
  }
  
  // Extract thumbnails in background
  extractThumbnailsForClip(timelineClip);
}

// Extract thumbnails for a timeline clip
async function extractThumbnailsForClip(clip) {
  try {
    const result = await ipcRenderer.invoke('extract-thumbnails', clip.path, clip.duration);
    if (result && result.success && result.thumbnails) {
      clip.thumbnails = result.thumbnails;
      clip.thumbnailsLoading = false;
      renderTimeline(); // Re-render to show thumbnails
    }
  } catch (err) {
    console.error('Failed to extract thumbnails:', err);
    clip.thumbnailsLoading = false;
  }
}

// Dropzone for importing files
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files || []);
  const videoFiles = files.filter(f => f.path.toLowerCase().endsWith('.mp4') || f.path.toLowerCase().endsWith('.mov'));
  videoFiles.forEach(f => addClipFromFile(f.path));
});

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  files.forEach(f => addClipFromFile(f.path));
  fileInput.value = ''; // Reset
});

// Track content: accept drops from library
// Track 1 (Main) drop handler
track1Content.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  track1Content.classList.add('drag-over-track');
});

track1Content.addEventListener('dragleave', (e) => {
  // Only remove if we're actually leaving the track area
  if (!track1Content.contains(e.relatedTarget)) {
    track1Content.classList.remove('drag-over-track');
  }
});

track1Content.addEventListener('drop', (e) => {
  e.preventDefault();
  track1Content.classList.remove('drag-over-track');
  const clipId = e.dataTransfer.getData('text/plain');
  if (clipId) {
    // Calculate startTime from mouse position
    const rect = track1Content.getBoundingClientRect();
    const x = e.clientX - rect.left + track1Content.scrollLeft;
    const startTime = x / timelineZoom;
    addClipToTimeline(clipId, 1, startTime);
  }
});

// Track 2 (Overlay) drop handler
track2Content.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  track2Content.classList.add('drag-over-track');
});

track2Content.addEventListener('dragleave', (e) => {
  // Only remove if we're actually leaving the track area
  if (!track2Content.contains(e.relatedTarget)) {
    track2Content.classList.remove('drag-over-track');
  }
});

track2Content.addEventListener('drop', (e) => {
  e.preventDefault();
  track2Content.classList.remove('drag-over-track');
  const clipId = e.dataTransfer.getData('text/plain');
  if (clipId) {
    // Calculate startTime from mouse position
    const rect = track2Content.getBoundingClientRect();
    const x = e.clientX - rect.left + track2Content.scrollLeft;
    const startTime = x / timelineZoom;
    addClipToTimeline(clipId, 2, startTime);
  }
});

// Timeline playback function
function updateTimelinePlayback(currentTime) {
  if (!timelinePlaybackState.isPlaying) return;
  
  const now = currentTime || performance.now() / 1000;
  
  if (timelinePlaybackState.lastFrameTime === null) {
    timelinePlaybackState.lastFrameTime = now;
    timelinePlaybackState.playbackStartTime = now;
    timelinePlaybackState.playbackStartPosition = timelineCurrentTime || 0;
  }
  
  const elapsed = now - timelinePlaybackState.playbackStartTime;
  const newPosition = timelinePlaybackState.playbackStartPosition + elapsed;
  
  // Calculate max timeline duration
  let maxDuration = 0;
  timelineClips.forEach(clip => {
    const clipEnd = (clip.startTime || 0) + (clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : (clip.duration || 10));
    maxDuration = Math.max(maxDuration, clipEnd);
  });
  
  // If we've reached the end, stop playback
  if (newPosition >= maxDuration) {
    timelineCurrentTime = maxDuration;
    stopTimelinePlayback();
    return;
  }
  
  timelineCurrentTime = newPosition;
  
  // Update playhead position
  if (playhead) {
    playhead.style.left = (80 + timelineCurrentTime * timelineZoom) + 'px';
  }
  
  // Update composite preview
  updateCompositePreview();
  
  // Schedule next frame
  if (timelinePlaybackState.isPlaying) {
    requestAnimationFrame(() => updateTimelinePlayback());
  }
}

function startTimelinePlayback() {
  if (timelinePlaybackState.isPlaying) return;
  
  timelinePlaybackState.isPlaying = true;
  timelinePlaybackState.lastFrameTime = null;
  playPauseBtn.textContent = '⏸';
  
  // Start playback loop
  updateTimelinePlayback();
  
  // Start video elements playing if they have clips
  if (previewState.track1Video && previewState.track1Clip) {
    previewState.track1Video.play().catch((e) => {
      // Ignore play() interruptions - usually happens when play/pause called rapidly
    });
  }
  if (previewState.track2Video && previewState.track2Clip) {
    previewState.track2Video.play().catch((e) => {
      // Ignore play() interruptions - usually happens when play/pause called rapidly
    });
  }
}

function stopTimelinePlayback() {
  if (!timelinePlaybackState.isPlaying) return;
  
  timelinePlaybackState.isPlaying = false;
  timelinePlaybackState.lastFrameTime = null;
  playPauseBtn.textContent = '▶';
  
  // Pause video elements
  if (previewState.track1Video) {
    previewState.track1Video.pause();
  }
  if (previewState.track2Video) {
    previewState.track2Video.pause();
  }
  
  // Still update preview once to show current frame
  updateCompositePreview();
  drawCompositeFrame();
}

// Transport controls
playPauseBtn.addEventListener('click', () => {
  if (timelinePlaybackState.isPlaying) {
    stopTimelinePlayback();
  } else {
    startTimelinePlayback();
  }
});

rewindBtn.addEventListener('click', () => {
  const newTime = Math.max(0, timelineCurrentTime - 5);
  seekToTimelinePosition(newTime);
});

forwardBtn.addEventListener('click', () => {
  // Calculate total timeline duration
  let totalDuration = 0;
  timelineClips.forEach(clip => {
    const clipEnd = (clip.startTime || 0) + (clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration);
    totalDuration = Math.max(totalDuration, clipEnd);
  });
  
  const newTime = Math.min(totalDuration, timelineCurrentTime + 5);
  seekToTimelinePosition(newTime);
});

// Update playhead position and composite preview
videoEl.addEventListener('timeupdate', () => {
  if (!videoEl.duration) return;
  
  // Calculate global timeline position
  const clip = selectedClipIndex != null ? timelineClips[selectedClipIndex] : null;
  if (clip) {
    const clipLocalTime = videoEl.currentTime - (clip.inPoint || 0);
    timelineCurrentTime = (clip.startTime || 0) + clipLocalTime;
  } else {
    timelineCurrentTime = videoEl.currentTime;
  }
  
  // Update playhead position based on global timeline time
  playhead.style.left = (80 + timelineCurrentTime * timelineZoom) + 'px'; // 80px for label width
  
  // Auto-scroll timeline to keep playhead in view
  const playheadPixelPos = timelineCurrentTime * timelineZoom;
  if (timelineScrollWrapper) {
    const containerWidth = timelineScrollWrapper.clientWidth;
    const scrollLeft = timelineScrollWrapper.scrollLeft;
    const visibleLeft = scrollLeft;
    const visibleRight = scrollLeft + containerWidth;
    const playheadAbsolutePos = 80 + playheadPixelPos; // Account for label width
    
    // Scale edge threshold based on zoom level (roughly 2 seconds of time at default zoom)
    const edgeThreshold = 2 * timelineZoom;
    
    // If playhead is outside visible area, scroll to center it
    const targetPos = playheadPixelPos - (containerWidth / 2);
    if (playheadAbsolutePos < visibleLeft + edgeThreshold) {
      // Playhead approaching left edge, scroll left
      timelineScrollWrapper.scrollLeft = Math.max(0, targetPos);
    } else if (playheadAbsolutePos > visibleRight - edgeThreshold) {
      // Playhead approaching right edge, scroll right
      timelineScrollWrapper.scrollLeft = Math.max(0, targetPos);
    }
  }
  
  // Update composite preview
  updateCompositePreview();
  
  // Check if we've reached the end of timeline (simplified - doesn't auto-advance clips in composite mode)
  // For now, just pause when reaching end
  const maxDuration = Math.max(...timelineClips.map(clip => {
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    return clipStart + clipDuration;
  }), 0);
  
  if (timelineCurrentTime >= maxDuration) {
    videoEl.pause();
    playPauseBtn.textContent = '▶';
  }
});

// Auto-play next clip when current one ends
videoEl.addEventListener('ended', () => {
  if (selectedClipIndex == null) return;
  
  // Move to next clip if available
  if (selectedClipIndex < timelineClips.length - 1) {
    selectTimelineClip(selectedClipIndex + 1);
    videoEl.play();
  } else {
    // Stop at end of last clip
    playPauseBtn.textContent = '▶';
  }
});

// Timeline click to seek (works on both tracks)
function setupTimelineClickSeek() {
  [track1Content, track2Content].forEach(trackContentEl => {
    trackContentEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('timeline-clip') || 
          e.target.classList.contains('timeline-clip-label') ||
          e.target.classList.contains('timeline-clip-resize-handle') ||
          e.target.id === 'playhead') {
        return;
      }
      
      seekToTimelinePosition(e);
    });
  });
}

// Timeline right-click for context menu (both tracks)
function setupTimelineContextMenu() {
  [track1Content, track2Content].forEach(trackContentEl => {
    trackContentEl.addEventListener('contextmenu', (e) => {
      // Prevent default browser context menu
      e.preventDefault();
      
      // Don't show menu on resize handles
      if (e.target.classList.contains('timeline-clip-resize-handle')) {
        return;
      }
      
      // Show context menu (will determine if split is possible inside showContextMenu)
      showContextMenu(e);
    });
  });
}

// Playhead dragging
let isPlayheadDragging = false;
playhead.addEventListener('mousedown', (e) => {
  isPlayheadDragging = true;
  document.body.style.cursor = 'pointer';
});

document.addEventListener('mousemove', (e) => {
  if (!isPlayheadDragging) return;
  
  const rect = timelineScrollWrapper ? timelineScrollWrapper.getBoundingClientRect() : track1Content.getBoundingClientRect();
  const scrollLeft = timelineScrollWrapper ? timelineScrollWrapper.scrollLeft : track1Content.scrollLeft;
  const x = e.clientX - rect.left + scrollLeft;
  const time = Math.max(0, (x - 80) / timelineZoom); // Subtract 80px for label width
  
  seekToTimelinePosition(time);
});

document.addEventListener('mouseup', () => {
  isPlayheadDragging = false;
  document.body.style.cursor = '';
});

// Helper function to seek to a timeline position
function seekToTimelinePosition(eventOrTime) {
  // Stop playback if seeking
  if (timelinePlaybackState.isPlaying) {
    stopTimelinePlayback();
  }
  
  let time;
  
  if (typeof eventOrTime === 'number') {
    time = eventOrTime;
  } else {
    // Calculate time from click position, accounting for label width
    const rect = timelineScrollWrapper ? timelineScrollWrapper.getBoundingClientRect() : track1Content.getBoundingClientRect();
    const x = eventOrTime.clientX - rect.left + (timelineScrollWrapper ? timelineScrollWrapper.scrollLeft : track1Content.scrollLeft);
    time = Math.max(0, (x - 80) / timelineZoom); // Subtract 80px for label width
  }
  
  timelineCurrentTime = time;
  timelinePlaybackState.playbackStartPosition = time; // Update playback start position
  
  // Update playhead position
  playhead.style.left = (80 + time * timelineZoom) + 'px';
  
  // Find which clip this time falls into (prefer track 1, then track 2)
  const track1Clip = findActiveClipAtTime(1, time);
  const track2Clip = findActiveClipAtTime(2, time);
  
  // Select clip if found (prefer track 1)
  if (track1Clip) {
    const clipIndex = timelineClips.indexOf(track1Clip);
    if (selectedClipIndex !== clipIndex) {
      selectTimelineClip(clipIndex);
    }
    const clipStart = track1Clip.startTime || 0;
    const clipLocalTime = time - clipStart;
    const videoTime = clipLocalTime + (track1Clip.inPoint || 0);
    if (previewState.track1Video) {
      previewState.track1Video.currentTime = videoTime;
    }
    videoEl.currentTime = videoTime;
  } else if (track2Clip) {
    const clipIndex = timelineClips.indexOf(track2Clip);
    if (selectedClipIndex !== clipIndex) {
      selectTimelineClip(clipIndex);
    }
    const clipStart = track2Clip.startTime || 0;
    const clipLocalTime = time - clipStart;
    const videoTime = clipLocalTime + (track2Clip.inPoint || 0);
    if (previewState.track2Video) {
      previewState.track2Video.currentTime = videoTime;
    }
    videoEl.currentTime = videoTime;
  }
  
  // Update composite preview
  updateCompositePreview();
  drawCompositeFrame();
}

// Update zoom level display
function updateZoomDisplay() {
  const zoomDisplay = document.getElementById('zoom-level-display');
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(timelineZoom)}px/s`;
  }
}

// Zoom controls
zoomInBtn.addEventListener('click', () => {
  timelineZoom = Math.min(200, timelineZoom + 10);
  updateZoomDisplay();
  renderTimeline();
});

zoomOutBtn.addEventListener('click', () => {
  timelineZoom = Math.max(10, timelineZoom - 10);
  updateZoomDisplay();
  renderTimeline();
});

// Apply trim from properties panel (bidirectional binding)
if (applyTrimBtn) {
  applyTrimBtn.addEventListener('click', () => {
    if (selectedClipIndex == null || !timelineClips[selectedClipIndex]) return;
    const clip = timelineClips[selectedClipIndex];
    let inVal = parseFloat(inPointInput?.value);
    let outVal = parseFloat(outPointInput?.value);
    if (Number.isNaN(inVal)) inVal = 0;
    if (Number.isNaN(outVal)) outVal = clip.duration;
    
    // Validation
    if (outVal <= inVal) {
      outVal = inVal + 0.1;
    }
    if (outVal > clip.duration) {
      outVal = clip.duration;
    }
    
    clip.inPoint = inVal;
    clip.outPoint = outVal;
    
    // Recalculate start times for all clips after this one
    recalculateTimelinePositions();
    renderTimeline();
  });
}

// Also allow Enter key to apply trim
if (inPointInput) {
  inPointInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && applyTrimBtn) {
      applyTrimBtn.click();
    }
  });
}

if (outPointInput) {
  outPointInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && applyTrimBtn) {
      applyTrimBtn.click();
    }
  });
}

// Recalculate timeline positions after trim changes
// Note: With free positioning, this is a no-op. Positions are set by user drag/drop.
function recalculateTimelinePositions() {
  // No-op: positions are managed manually with free positioning
  // This function is kept for backward compatibility with existing code
}

// Delete selected clip from timeline
function deleteSelectedClip() {
  if (selectedClipIndex === null || selectedClipIndex < 0 || selectedClipIndex >= timelineClips.length) {
    return;
  }
  
  const deletedIndex = selectedClipIndex;
  
  // Remove the clip from timeline
  timelineClips.splice(selectedClipIndex, 1);
  
  // Clear selection and video preview
  selectedClipIndex = null;
  videoEl.src = '';
  videoEl.load();
  
  // Clear properties panel
  if (inPointInput) inPointInput.value = '0';
  if (outPointInput) outPointInput.value = '0';
  
  // Recalculate timeline positions
  recalculateTimelinePositions();
  
  // Re-render timeline
  renderTimeline();
  
  // If there are still clips, select the one at the deleted position (or the last one if it was the last)
  if (timelineClips.length > 0) {
    const newIndex = Math.min(deletedIndex, timelineClips.length - 1);
    selectTimelineClip(newIndex);
  }
  
  console.log('Clip deleted from timeline');
}

// Detect gaps in timeline
function detectGaps() {
  const gaps = [];
  
  // Check each track separately
  for (let trackNum = 1; trackNum <= 2; trackNum++) {
    const trackClips = timelineClips.filter(clip => (clip.track || 1) === trackNum);
    if (trackClips.length === 0) continue;
    
    // Sort clips by startTime
    trackClips.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    
    // Check gap before first clip
    const firstClip = trackClips[0];
    const firstStart = firstClip.startTime || 0;
    if (firstStart > 0) {
      gaps.push({
        track: trackNum,
        start: 0,
        end: firstStart,
        duration: firstStart
      });
    }
    
    // Check gaps between clips
    for (let i = 0; i < trackClips.length - 1; i++) {
      const clip = trackClips[i];
      const nextClip = trackClips[i + 1];
      const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
      const clipEnd = (clip.startTime || 0) + clipDuration;
      const nextStart = nextClip.startTime || 0;
      
      if (nextStart > clipEnd) {
        gaps.push({
          track: trackNum,
          start: clipEnd,
          end: nextStart,
          duration: nextStart - clipEnd
        });
      }
    }
  }
  
  return gaps;
}

// Show export warning modal if gaps detected
function showExportWarningModal(gaps, proceedCallback) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('export-gap-warning-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'export-gap-warning-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">Gaps Detected in Timeline</div>
          <button class="modal-close" id="closeExportWarningModal">×</button>
        </div>
        <div id="export-gap-warning-content" style="padding: 20px;">
          <p style="color: #e0e0e0; margin-bottom: 15px;">
            Your timeline contains gaps (empty spaces). These will be filled with black frames in the exported video.
          </p>
          <div id="gap-list" style="margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="settings-btn-secondary" id="cancelExportBtn">Cancel</button>
            <button class="settings-btn-primary" id="proceedExportBtn">Proceed with Export</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('closeExportWarningModal').addEventListener('click', () => {
      modal.classList.remove('show');
    });
    document.getElementById('cancelExportBtn').addEventListener('click', () => {
      modal.classList.remove('show');
    });
    document.getElementById('proceedExportBtn').addEventListener('click', () => {
      modal.classList.remove('show');
      if (proceedCallback) proceedCallback();
    });
  }
  
  // Update gap list
  const gapList = document.getElementById('gap-list');
  gapList.innerHTML = '<div style="font-size: 12px; color: #b0b0b0; margin-bottom: 8px;">Gaps found:</div>';
  gaps.forEach((gap, idx) => {
    const gapEl = document.createElement('div');
    gapEl.style.cssText = 'font-size: 11px; color: #999; margin-bottom: 4px; padding: 4px; background: #1f1f1f; border-radius: 3px;';
    const startStr = formatTime(gap.start);
    const endStr = formatTime(gap.end);
    const durationStr = formatTime(gap.duration);
    gapEl.textContent = `Track ${gap.track}: ${durationStr} gap from ${startStr} to ${endStr}`;
    gapList.appendChild(gapEl);
  });
  
  modal.classList.add('show');
}

// Helper to format time as HH:MM:SS.mmm (for non-timeline display like export warnings)
// Uses decimal format since it's informational text, not for precise editing
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  } else {
    // Shorter format if less than an hour
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
}

// Export
function exportConcatenated() {
  if (timelineClips.length === 0) {
    setExportStatus('No clips on timeline to export', '#ff4444');
    return;
  }
  
  // Check for gaps
  const gaps = detectGaps();
  if (gaps.length > 0) {
    // Show warning modal
    showExportWarningModal(gaps, () => {
      // User confirmed, proceed with export
      performExport();
    });
    return;
  }
  
  // No gaps, proceed directly
  performExport();
}

function performExport() {
  setExportStatus('Starting export...', '#4a9eff');
  const resolutionSelect = document.getElementById('export-resolution-select');
  const resolution = resolutionSelect ? resolutionSelect.value : 'source';
  ipcRenderer.invoke('export-video', timelineClips, resolution)
    .then((response) => {
      if (response && response.success) {
        setExportStatus('Export completed: ' + (response.path || 'unknown'), '#4caf50');
        // Show press kit generation popup
        showPressKitPopup(response.path);
      } else {
        setExportStatus('Export failed' + (response && response.error ? ': ' + response.error : ''), '#ff4444');
      }
    })
    .catch((err) => {
      setExportStatus('Export error: ' + err.message, '#ff4444');
    });
}

exportBtn?.addEventListener('click', exportConcatenated);

// Mute/Unmute clip button
if (muteClipBtn) {
  muteClipBtn.addEventListener('click', () => {
    if (selectedClipIndex !== null && timelineClips[selectedClipIndex]) {
      const clip = timelineClips[selectedClipIndex];
      clip.muted = !clip.muted;
      muteClipBtn.textContent = clip.muted ? 'Unmute Clip' : 'Mute Clip';
      muteClipBtn.classList.toggle('muted', clip.muted);
      renderTimeline(); // Re-render to update muted visual
    }
  });
}

// Delete clip button
if (deleteClipBtn) {
  deleteClipBtn.addEventListener('click', () => {
    if (selectedClipIndex !== null) {
      deleteSelectedClip();
    }
  });
}

// ===== CLIP SPLITTING FUNCTIONS =====

// Show context menu on right-click
function showContextMenu(event) {
  // Prevent default browser context menu
  event.preventDefault();
  event.stopPropagation();
  
  // Create context menu if it doesn't exist
  if (!contextMenu) {
    contextMenu = document.createElement('div');
    contextMenu.id = 'timeline-context-menu';
    contextMenu.className = 'context-menu';
    
    const splitOption = document.createElement('div');
    splitOption.className = 'context-menu-item';
    splitOption.id = 'splitClipOption';
    splitOption.textContent = 'Split Clip';
    splitOption.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contextMenuClipIndex !== null && contextMenuTimelineTime !== null) {
        splitClipAtTimelineTime(contextMenuClipIndex, contextMenuTimelineTime);
      }
      hideContextMenu();
    });
    
    contextMenu.appendChild(splitOption);
    document.body.appendChild(contextMenu);
  }
  
  // Calculate timeline time from click position
  const rect = trackContent.getBoundingClientRect();
  const x = event.clientX - rect.left + trackContent.scrollLeft;
  const timelineTime = x / timelineZoom;
  
  // Find which clip contains this timeline position
  let foundClipIndex = null;
  for (let i = 0; i < timelineClips.length; i++) {
    const clip = timelineClips[i];
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    if (timelineTime >= clipStart && timelineTime < clipEnd) {
      // Check if clip can be split (not a live recording clip)
      if (clip.isLive) {
        hideContextMenu();
        return;
      }
      
      // Calculate local split time within clip
      const localSplitTime = clip.inPoint + (timelineTime - clipStart);
      
      // Validate split is possible (not at boundaries, minimum duration)
      const leftDuration = localSplitTime - clip.inPoint;
      const rightDuration = clip.outPoint - localSplitTime;
      
      if (leftDuration >= 0.1 && rightDuration >= 0.1 && 
          localSplitTime > clip.inPoint && localSplitTime < clip.outPoint) {
        foundClipIndex = i;
        break;
      }
    }
  }
  
  // Only show menu if click is within a splittable clip
  if (foundClipIndex !== null) {
    contextMenuClipIndex = foundClipIndex;
    contextMenuTimelineTime = timelineTime;
    
    // Position menu at cursor
    contextMenu.style.left = event.clientX + 'px';
    contextMenu.style.top = event.clientY + 'px';
    contextMenu.classList.add('show');
    
    // Add click-outside listener (one-time)
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        // Don't close if clicking on the context menu itself
        if (contextMenu && contextMenu.contains(e.target)) {
          return;
        }
        // Don't close if clicking on buttons or other interactive elements
        const isButton = e.target.tagName === 'BUTTON' || e.target.closest('button');
        const isTransportBtn = e.target.closest('.transport-btn');
        const isInModal = e.target.closest('#recording-modal') || e.target.closest('.modal-content');
        
        if (isButton || isTransportBtn || isInModal) {
          return;
        }
        
        hideContextMenu();
      }, { once: true });
    }, 0);
  } else {
    hideContextMenu();
  }
}

// Hide context menu
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.remove('show');
  }
  contextMenuClipIndex = null;
  contextMenuTimelineTime = null;
}

// Split clip at timeline time
function splitClipAtTimelineTime(clipIndex, timelineTime) {
  if (clipIndex < 0 || clipIndex >= timelineClips.length) {
    console.error('Invalid clip index for split');
    return;
  }
  
  const clip = timelineClips[clipIndex];
  
  // Check if clip is live (shouldn't be splittable)
  if (clip.isLive) {
    console.warn('Cannot split live recording clip');
    return;
  }
  
  // Calculate local split time within clip
  const clipStart = clip.startTime || 0;
  const localSplitTime = clip.inPoint + (timelineTime - clipStart);
  
  // Validate local split time is within clip bounds
  if (localSplitTime <= clip.inPoint || localSplitTime >= clip.outPoint) {
    console.error('Split time is at clip boundary');
    return;
  }
  
  // Validate minimum durations
  const leftDuration = localSplitTime - clip.inPoint;
  const rightDuration = clip.outPoint - localSplitTime;
  
  if (leftDuration < 0.1 || rightDuration < 0.1) {
    console.error('Split would create clip shorter than 0.1s');
    alert('Cannot split: resulting clips would be too short (minimum 0.1s each)');
    return;
  }
  
  // Store original outPoint for right clip (before modifying left clip)
  const originalOutPoint = clip.outPoint;
  const leftClipDuration = localSplitTime - clip.inPoint;
  
  // Modify left clip (existing clip) - keeps original track and properties
  clip.outPoint = localSplitTime;
  
  // Calculate right clip start time (right after left clip ends on same track)
  const rightClipStartTime = clipStart + leftClipDuration;
  
  // Create right clip (new clip) - preserve track and muted properties
  const rightClip = {
    id: 'timeline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    sourceId: clip.sourceId,
    path: clip.path,
    originalPath: clip.originalPath,
    name: clip.name,
    duration: clip.duration,
    inPoint: localSplitTime,
    outPoint: originalOutPoint,
    startTime: rightClipStartTime, // Position right after left clip ends on same track
    track: clip.track || 1, // Preserve original track (important!)
    muted: clip.muted || false, // Preserve muted state
    thumbnails: [],
    thumbnailsLoading: true
  };
  
  // Insert right clip after left clip
  timelineClips.splice(clipIndex + 1, 0, rightClip);
  
  // Recalculate all timeline positions
  recalculateTimelinePositions();
  
  // Update selected clip index if needed
  if (selectedClipIndex === clipIndex) {
    // Keep selection on left clip
    // No change needed
  } else if (selectedClipIndex > clipIndex) {
    // Selection moves down by one index because we inserted a clip
    selectedClipIndex += 1;
  }
  
  // Trigger thumbnail extraction for new right clip
  extractThumbnailsForClip(rightClip);
  
  // Re-render timeline
  renderTimeline();
  
  console.log('Clip split at timeline time:', timelineTime, 'local time:', localSplitTime);
}

// Cancel export with Escape key, Delete/Backspace for clip deletion
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close context menu if open
    if (contextMenu && contextMenu.classList.contains('show')) {
      hideContextMenu();
    } else {
      // Otherwise cancel export
      ipcRenderer.send('cancel-export');
      setExportStatus('Export canceled', '#ff4444');
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIndex !== null) {
    // Only delete if not typing in an input field
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      deleteSelectedClip();
    }
  }
});

// Listen for export progress
ipcRenderer.on('export-progress', (event, payload) => {
  if (!payload) return;
  const { segmentIndex, total, message, color } = payload;
  setExportStatus(message || 'Export in progress', color);
  if (exportProgressBar && typeof segmentIndex === 'number' && typeof total === 'number') {
    const pct = Math.min(100, Math.max(0, Math.round((segmentIndex / total) * 100)));
    exportProgressBar.style.width = pct + '%';
  }
});

// Phase 5: Direct Timeline Manipulation
let dragState = {
  isDragging: false,
  isResizing: false,
  resizeHandle: null, // 'left' or 'right'
  draggedClipIndex: null,
  startX: 0,
  startLeft: 0,
  startWidth: 0,
  originalInPoint: 0,
  originalOutPoint: 0,
};

// Helper to find clip element on either track
function findClipElement(clipIndex) {
  const el1 = track1Content.querySelector(`[data-clip-index="${clipIndex}"]`);
  const el2 = track2Content.querySelector(`[data-clip-index="${clipIndex}"]`);
  return el1 || el2;
}

// Helper to get track content for a clip
function getTrackContentForClip(clipIndex) {
  const clip = timelineClips[clipIndex];
  if (!clip) return track1Content;
  const track = clip.track || 1;
  return track === 1 ? track1Content : track2Content;
}

// Smart snapping helper - returns snapped time or original time
function smartSnap(time, excludeClipIndex, track, shiftKey) {
  if (shiftKey) return time; // Free positioning with Shift
  
  const snapThreshold = 10 / timelineZoom; // ~10 pixels in time units
  let snappedTime = time;
  
  // Snap to playhead
  const playheadDiff = Math.abs(time - timelineCurrentTime);
  if (playheadDiff < snapThreshold) {
    snappedTime = timelineCurrentTime;
  }
  
  // Snap to ruler markers
  let interval = 1;
  if (timelineZoom < 20) interval = 5;
  else if (timelineZoom < 40) interval = 2;
  const rulerSnap = Math.round(time / interval) * interval;
  if (Math.abs(time - rulerSnap) < snapThreshold) {
    snappedTime = rulerSnap;
  }
  
  // Snap to clip edges on same track
  timelineClips.forEach((otherClip, idx) => {
    if (idx === excludeClipIndex || (otherClip.track || 1) !== track) return;
    const otherStart = otherClip.startTime || 0;
    const otherDuration = otherClip.outPoint > 0 ? (otherClip.outPoint - otherClip.inPoint) : otherClip.duration;
    const otherEnd = otherStart + otherDuration;
    
    // Snap to start
    if (Math.abs(time - otherStart) < snapThreshold) {
      snappedTime = otherStart;
    }
    // Snap to end
    if (Math.abs(time - otherEnd) < snapThreshold) {
      snappedTime = otherEnd;
    }
  });
  
  return snappedTime;
}

// Check for overlap on same track
function checkOverlap(clipIndex, newStartTime, clipDuration, track) {
  const newEndTime = newStartTime + clipDuration;
  
  for (let i = 0; i < timelineClips.length; i++) {
    if (i === clipIndex) continue;
    const otherClip = timelineClips[i];
    if ((otherClip.track || 1) !== track) continue; // Only check same track
    
    const otherStart = otherClip.startTime || 0;
    const otherDuration = otherClip.outPoint > 0 ? (otherClip.outPoint - otherClip.inPoint) : otherClip.duration;
    const otherEnd = otherStart + otherDuration;
    
    // Check for overlap
    if (newStartTime < otherEnd && newEndTime > otherStart) {
      return true; // Overlap detected
    }
  }
  return false;
}

// Setup drag and resize handlers
// Setup synchronized scrolling between tracks
function setupSynchronizedScrolling() {
  if (!track1Content || !track2Content || !timelineScrollWrapper) return;
  
  // Use the wrapper's scroll since tracks are children
  // The wrapper already handles scrolling for both tracks
  // This function exists for potential future enhancements
  let isScrolling = false;
  
  timelineScrollWrapper.addEventListener('scroll', () => {
    if (isScrolling) return;
    // Tracks scroll together via the wrapper, no action needed
    // But we could add ruler sync here if needed
  });
}

function setupClipDragAndResize() {
  // Listen on both tracks
  function handleMouseDown(e, trackContentElement) {
    const clipEl = e.target.closest('.timeline-clip');
    if (!clipEl) return;
    
    const clipIndex = parseInt(clipEl.dataset.clipIndex);
    const clip = timelineClips[clipIndex];
    if (!clip) return;
    
    // Check if clicking on resize handle
    if (e.target.classList.contains('timeline-clip-resize-handle')) {
      e.preventDefault();
      dragState.isResizing = true;
      dragState.resizeHandle = e.target.classList.contains('left') ? 'left' : 'right';
      dragState.draggedClipIndex = clipIndex;
      dragState.startX = e.clientX;
      dragState.startLeft = parseFloat(clipEl.style.left);
      dragState.startWidth = parseFloat(clipEl.style.width);
      dragState.originalInPoint = clip.inPoint;
      dragState.originalOutPoint = clip.outPoint;
      dragState.originalStartTime = clip.startTime || 0;
      document.body.style.cursor = 'ew-resize';
      return;
    }
    
    // Otherwise, setup for dragging to reposition
    dragState.isDragging = true;
    dragState.draggedClipIndex = clipIndex;
    dragState.startX = e.clientX;
    dragState.startLeft = parseFloat(clipEl.style.left);
    dragState.originalStartTime = clip.startTime || 0;
    clipEl.style.opacity = '0.6';
    clipEl.style.zIndex = '1000';
    document.body.style.cursor = 'grabbing';
  }
  
  track1Content.addEventListener('mousedown', (e) => handleMouseDown(e, track1Content));
  track2Content.addEventListener('mousedown', (e) => handleMouseDown(e, track2Content));
  
  document.addEventListener('mousemove', (e) => {
    if (dragState.isResizing) {
      handleResize(e);
    } else if (dragState.isDragging) {
      handleDrag(e);
    }
  });
  
  document.addEventListener('mouseup', (e) => {
    if (dragState.isResizing) {
      finishResize();
    } else if (dragState.isDragging) {
      finishDrag();
    }
  });
}

function handleResize(e) {
  const clipIndex = dragState.draggedClipIndex;
  const clip = timelineClips[clipIndex];
  const clipEl = findClipElement(clipIndex);
  if (!clip || !clipEl) return;
  
  const deltaX = e.clientX - dragState.startX;
  const deltaTime = deltaX / timelineZoom;
  
  if (dragState.resizeHandle === 'left') {
    // Resize left edge (adjust inPoint and startTime)
    const newInPoint = Math.max(0, dragState.originalInPoint + deltaTime);
    const maxInPoint = clip.duration - 0.1; // Minimum 0.1s duration
    
    if (newInPoint < maxInPoint) {
      clip.inPoint = newInPoint;
      // Adjust startTime to keep visual position correct when trimming inPoint
      const inPointChange = newInPoint - dragState.originalInPoint;
      clip.startTime = dragState.originalStartTime + inPointChange;
      
      // Update visual
      const trimmedDuration = clip.outPoint - clip.inPoint;
      const newWidth = trimmedDuration * timelineZoom;
      const newLeft = dragState.startLeft + deltaX;
      clipEl.style.width = newWidth + 'px';
      clipEl.style.left = newLeft + 'px';
      
      // Update properties panel
      if (selectedClipIndex === clipIndex && inPointInput) {
        inPointInput.value = clip.inPoint.toFixed(2);
      }
    }
  } else if (dragState.resizeHandle === 'right') {
    // Resize right edge (adjust outPoint)
    const newOutPoint = Math.min(clip.duration, dragState.originalOutPoint + deltaTime);
    const minOutPoint = clip.inPoint + 0.1; // Minimum 0.1s duration
    
    if (newOutPoint > minOutPoint) {
      clip.outPoint = newOutPoint;
      
      // Update visual
      const trimmedDuration = clip.outPoint - clip.inPoint;
      const newWidth = trimmedDuration * timelineZoom;
      clipEl.style.width = newWidth + 'px';
      
      // Update properties panel
      if (selectedClipIndex === clipIndex && outPointInput) {
        outPointInput.value = clip.outPoint.toFixed(2);
      }
    }
  }
}

function finishResize() {
  dragState.isResizing = false;
  dragState.resizeHandle = null;
  document.body.style.cursor = '';
  
  // Recalculate timeline positions
  recalculateTimelinePositions();
  renderTimeline();
}

function handleDrag(e) {
  const clipIndex = dragState.draggedClipIndex;
  const clip = timelineClips[clipIndex];
  const clipEl = findClipElement(clipIndex);
  if (!clip || !clipEl) return;
  
  const trackContentEl = getTrackContentForClip(clipIndex);
  const rect = trackContentEl.getBoundingClientRect();
  const x = e.clientX - rect.left + trackContentEl.scrollLeft;
  let newTime = x / timelineZoom;
  
  // Apply smart snapping (check Shift key)
  const shiftKey = e.shiftKey;
  const track = clip.track || 1;
  newTime = smartSnap(newTime, clipIndex, track, shiftKey);
  
  // Prevent negative time
  newTime = Math.max(0, newTime);
  
  // Check for overlap on same track
  const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
  const wouldOverlap = checkOverlap(clipIndex, newTime, clipDuration, track);
  
  if (!wouldOverlap) {
    clip.startTime = newTime;
    const newLeft = newTime * timelineZoom;
    clipEl.style.left = newLeft + 'px';
  }
  // If overlap, don't update position (clip stays at last valid position)
}

function finishDrag() {
  const clipIndex = dragState.draggedClipIndex;
  const clipEl = findClipElement(clipIndex);
  
  if (clipEl) {
    clipEl.style.opacity = '';
    clipEl.style.zIndex = '';
    
    // Update clip's startTime from visual position
    const clip = timelineClips[clipIndex];
    if (clip) {
      const newLeft = parseFloat(clipEl.style.left);
      const newTime = newLeft / timelineZoom;
      clip.startTime = newTime;
    }
  }
  
  dragState.isDragging = false;
  dragState.draggedClipIndex = null;
  document.body.style.cursor = '';
  
  // Re-render to ensure consistency
  renderTimeline();
}

// ===== AUDIO WAVEFORM FUNCTIONS =====

// Generate audio waveform data from video file
async function generateAudioWaveform(clip) {
  try {
    // Check if already generating
    if (clip.audioWaveformGenerating) return;
    clip.audioWaveformGenerating = true;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create audio element to load the file
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = clip.path;
    
    // Load audio into AudioContext
    const source = audioContext.createMediaElementSource(audio);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // Wait for audio to load metadata
    await new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve);
      audio.addEventListener('error', reject);
      audio.load();
      setTimeout(reject, 10000); // 10 second timeout
    });
    
    // Play and capture audio data
    audio.play();
    await new Promise(resolve => setTimeout(resolve, 100)); // Let it start playing
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    audio.pause();
    audio.currentTime = 0;
    
    // Extract waveform samples
    const samples = 100; // Number of waveform points
    const blockSize = Math.floor(bufferLength / samples);
    const waveform = [];
    
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        const idx = i * blockSize + j;
        if (idx < bufferLength) {
          sum += Math.abs(dataArray[idx] - 128) / 128; // Normalize to 0-1
        }
      }
      waveform.push(sum / blockSize);
    }
    
    // Normalize waveform values
    const max = Math.max(...waveform);
    if (max > 0) {
      clip.audioWaveform = waveform.map(val => val / max);
    } else {
      clip.audioWaveform = waveform;
    }
    
    clip.audioWaveformGenerating = false;
    
    // Re-render timeline to show waveform
    renderTimeline();
    
  } catch (err) {
    console.error('Error generating waveform:', err);
    clip.audioWaveformGenerating = false;
    // Create empty waveform on error
    clip.audioWaveform = [];
  }
}

// Render waveform visualization
function renderWaveform(container, waveform, clipWidth) {
  const canvas = document.createElement('canvas');
  canvas.width = clipWidth;
  canvas.height = 20;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  const ctx = canvas.getContext('2d');
  const centerY = canvas.height / 2;
  const barWidth = Math.max(1, clipWidth / waveform.length);
  
  ctx.fillStyle = '#4a9eff';
  
  waveform.forEach((value, index) => {
    const x = index * barWidth;
    const height = value * (canvas.height - 4); // Leave 2px padding top/bottom
    const y = centerY - height / 2;
    
    ctx.fillRect(x, y, barWidth - 1, height);
  });
  
  container.innerHTML = '';
  container.appendChild(canvas);
}

// ===== RECORDING FUNCTIONS =====

// Open recording modal and populate source lists
async function openRecordingModal() {
  console.log('openRecordingModal called');
  
  if (!recordingModal) {
    console.error('Recording modal not found!');
    return;
  }
  
  console.log('Showing recording modal');
  recordingModal.classList.add('show');
  
  try {
    // Get desktop sources
    const desktopResult = await ipcRenderer.invoke('get-desktop-sources');
    if (desktopResult.success) {
      desktopSourceSelect.innerHTML = '<option value="">Select source...</option>';
      desktopResult.sources.forEach(source => {
        const option = document.createElement('option');
        option.value = source.id;
        // Truncate long names to prevent overflow
        let displayText = `${source.type === 'screen' ? 'Screen' : 'Window'}: ${source.name}`;
        if (displayText.length > 60) {
          displayText = displayText.substring(0, 57) + '...';
        }
        option.textContent = displayText;
        option.title = `${source.type === 'screen' ? 'Screen' : 'Window'}: ${source.name}`; // Full text on hover
        desktopSourceSelect.appendChild(option);
      });
    }
    
    // Get webcam sources
    const webcamDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = webcamDevices.filter(device => device.kind === 'videoinput');
    webcamSourceSelect.innerHTML = '<option value="">Select webcam...</option>';
    videoDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      let displayText = device.label || `Camera ${device.deviceId.substring(0, 8)}`;
      if (displayText.length > 50) {
        displayText = displayText.substring(0, 47) + '...';
      }
      option.textContent = displayText;
      option.title = device.label || `Camera ${device.deviceId}`; // Full text on hover
      webcamSourceSelect.appendChild(option);
    });
    
    // Get microphone sources
    const audioDevices = webcamDevices.filter(device => device.kind === 'audioinput');
    microphoneSourceSelect.innerHTML = '<option value="">Select microphone...</option>';
    audioDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      let displayText = device.label || `Microphone ${device.deviceId.substring(0, 8)}`;
      if (displayText.length > 50) {
        displayText = displayText.substring(0, 47) + '...';
      }
      option.textContent = displayText;
      option.title = device.label || `Microphone ${device.deviceId}`; // Full text on hover
      microphoneSourceSelect.appendChild(option);
    });
    
  } catch (err) {
    console.error('Error populating sources:', err);
  }
}

// Close recording modal
function closeRecordingModalFunction() {
  recordingModal.classList.remove('show');
  // Reset form
  desktopSourceSelect.value = '';
  webcamSourceSelect.value = '';
  microphoneSourceSelect.value = '';
  webcamToggle.textContent = 'Disabled';
  webcamToggle.classList.remove('active');
  if (webcamSourceSelect) {
    webcamSourceSelect.disabled = true;
  }
  recordingTimer.style.display = 'none';
  startRecordingBtn.disabled = false;
}

// Get desktop sources via IPC
async function getDesktopSources() {
  try {
    const result = await ipcRenderer.invoke('get-desktop-sources');
    return result.success ? result.sources : [];
  } catch (err) {
    console.error('Error getting desktop sources:', err);
    return [];
  }
}

// Initialize media streams
async function initializeStreams() {
  const desktopSourceId = desktopSourceSelect.value;
  const webcamSourceId = webcamSourceSelect.value;
  const microphoneSourceId = microphoneSourceSelect.value;
  
  try {
    // Desktop/Window stream
    if (desktopSourceId) {
      recordingState.streams.desktop = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: desktopSourceId
          }
        }
      });
    }
    
    // Webcam stream
    console.log('Webcam source ID:', webcamSourceId);
    console.log('Webcam toggle active:', webcamToggle ? webcamToggle.classList.contains('active') : 'toggle not found');
    
    if (webcamSourceId && webcamToggle && webcamToggle.classList.contains('active')) {
      console.log('Initializing webcam stream with device:', webcamSourceId);
      recordingState.streams.webcam = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: webcamSourceId }
        }
      });
      console.log('Webcam stream created:', recordingState.streams.webcam);
    } else {
      console.log('Webcam not enabled or no source selected. SourceId:', webcamSourceId, 'Toggle active:', webcamToggle ? webcamToggle.classList.contains('active') : 'toggle not found');
    }
    
    // Audio stream
    if (microphoneSourceId) {
      console.log('Initializing microphone stream with device:', microphoneSourceId);
      recordingState.streams.audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: microphoneSourceId }
        },
        video: false
      });
      console.log('Microphone stream created:', recordingState.streams.audio);
      console.log('Microphone audio tracks:', recordingState.streams.audio.getTracks().map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
    } else {
      console.warn('No microphone source selected!');
    }
    
    return true;
  } catch (err) {
    console.error('Error initializing streams:', err);
    return false;
  }
}


// Composite streams using canvas
function compositeStreams() {
  console.log('Starting canvas compositing...');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas size to match desktop stream
  const desktopVideo = document.createElement('video');
  desktopVideo.srcObject = recordingState.streams.desktop;
  desktopVideo.play();
  
  console.log('Desktop stream:', recordingState.streams.desktop);
  console.log('Webcam stream:', recordingState.streams.webcam);
  
  desktopVideo.addEventListener('loadedmetadata', () => {
    console.log('Desktop video loaded:', desktopVideo.videoWidth, 'x', desktopVideo.videoHeight);
    canvas.width = desktopVideo.videoWidth;
    canvas.height = desktopVideo.videoHeight;
    
    // Create webcam video element if webcam is enabled
    let webcamVideo = null;
    if (recordingState.streams.webcam) {
      console.log('Creating webcam video element');
      webcamVideo = document.createElement('video');
      webcamVideo.srcObject = recordingState.streams.webcam;
      webcamVideo.play();
      
      webcamVideo.addEventListener('loadedmetadata', () => {
        console.log('Webcam video loaded:', webcamVideo.videoWidth, 'x', webcamVideo.videoHeight);
      });
    }
    
    // Animation loop for compositing
    function drawFrame() {
      if (!recordingState.isRecording) return;
      
      // Draw desktop stream
      ctx.drawImage(desktopVideo, 0, 0, canvas.width, canvas.height);
      
      // Draw webcam overlay if enabled
      if (webcamVideo && webcamVideo.readyState >= 2) {
        const webcamWidth = canvas.width * 0.25; // 25% width
        const webcamHeight = (webcamVideo.videoHeight / webcamVideo.videoWidth) * webcamWidth;
        const x = canvas.width - webcamWidth - 10; // 10px padding
        const y = canvas.height - webcamHeight - 10; // 10px padding
        
        console.log('Drawing webcam overlay at:', x, y, webcamWidth, webcamHeight);
        ctx.drawImage(webcamVideo, x, y, webcamWidth, webcamHeight);
      }
      
      requestAnimationFrame(drawFrame);
    }
    
    drawFrame();
  });
  
  recordingState.canvas = canvas;
  recordingState.canvasStream = canvas.captureStream(30); // 30 FPS
  
  console.log('Canvas stream created:', recordingState.canvasStream);
  return recordingState.canvasStream;
}

// Add live clip to timeline during recording
function addLiveClipToTimeline() {
  const liveClipId = 'live_recording_' + Date.now();
  recordingState.liveClipId = liveClipId;
  
  // Calculate start time (after last clip on any track)
  let startTime = 0;
  if (timelineClips.length > 0) {
    // Find the latest end time across all clips on all tracks
    timelineClips.forEach(clip => {
      const clipStart = clip.startTime || 0;
      const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
      const clipEnd = clipStart + clipDuration;
      startTime = Math.max(startTime, clipEnd);
    });
  }
  
  const liveClip = {
    id: liveClipId,
    sourceId: null,
    path: null,
    originalPath: null,
    name: 'Recording...',
    duration: 0.1, // Start with small duration
    inPoint: 0,
    outPoint: 0.1,
    startTime: startTime,
    track: 1, // Live recordings go to Track 1 (main)
    muted: false,
    thumbnails: [],
    thumbnailsLoading: false,
    isLive: true
  };
  
  timelineClips.push(liveClip);
  renderTimeline();
  
  // Update duration every 500ms
  recordingState.updateInterval = setInterval(() => {
    updateLiveClipDuration();
  }, 500);
}

// Update live clip duration during recording
function updateLiveClipDuration() {
  if (!recordingState.isRecording || !recordingState.liveClipId) return;
  
  const elapsed = (Date.now() - recordingState.startTime) / 1000; // seconds
  const liveClip = timelineClips.find(clip => clip.id === recordingState.liveClipId);
  
  if (liveClip) {
    liveClip.duration = elapsed;
    liveClip.outPoint = elapsed;
    
    // Update playhead position to track the recording progress
    const currentTimelineTime = (liveClip.startTime || 0) + elapsed;
    timelineCurrentTime = currentTimelineTime;
    
    // Update playhead visual position
    if (playhead) {
      playhead.style.left = (80 + currentTimelineTime * timelineZoom) + 'px';
    }
    
    // Auto-scroll timeline to keep playhead in view
    if (timelineScrollWrapper) {
      const containerWidth = timelineScrollWrapper.clientWidth;
      const scrollLeft = timelineScrollWrapper.scrollLeft;
      const playheadPixelPos = currentTimelineTime * timelineZoom;
      const playheadAbsolutePos = 80 + playheadPixelPos; // Account for label width
      const visibleLeft = scrollLeft;
      const visibleRight = scrollLeft + containerWidth;
      const edgeThreshold = 2 * timelineZoom;
      
      if (playheadAbsolutePos < visibleLeft + edgeThreshold || playheadAbsolutePos > visibleRight - edgeThreshold) {
        // Scroll to keep playhead centered
        const targetPos = playheadPixelPos - (containerWidth / 2);
        timelineScrollWrapper.scrollLeft = Math.max(0, targetPos);
      }
    }
    
    renderTimeline();
  }
}

// Start recording
async function startRecording() {
  if (recordingState.isRecording) return;
  
  // Validate required sources
  if (!desktopSourceSelect.value) {
    alert('Please select a screen or window to record');
    return;
  }
  
  try {
    // Initialize streams
    const streamsInitialized = await initializeStreams();
    if (!streamsInitialized) {
      alert('Failed to initialize recording streams');
      return;
    }
    
    // Composite streams if needed
    let finalVideoStream = recordingState.streams.desktop;
    if (recordingState.streams.webcam) {
      console.log('Webcam detected, starting compositing...');
      finalVideoStream = compositeStreams();
    } else {
      console.log('No webcam, using desktop stream only');
    }
    
    // Combine video and audio streams
    const tracks = [...finalVideoStream.getTracks()];
    console.log('Video tracks:', tracks.length, tracks.map(t => ({kind: t.kind, label: t.label})));
    
    if (recordingState.streams.audio) {
      const audioTracks = recordingState.streams.audio.getTracks();
      console.log('Audio tracks found:', audioTracks.length, audioTracks.map(t => ({kind: t.kind, label: t.label, enabled: t.enabled})));
      tracks.push(...audioTracks);
    } else {
      console.warn('No audio stream available for recording!');
    }
    
    console.log('Combined stream tracks:', tracks.length, tracks.map(t => ({kind: t.kind, label: t.label})));
    const combinedStream = new MediaStream(tracks);
    
    // Setup MediaRecorder
    const options = {
      mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    };
    
    // Fallback to WebM if MP4 not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm; codecs="vp8, opus"';
    }
    
    recordingState.mediaRecorder = new MediaRecorder(combinedStream, options);
    recordingState.recordedChunks = [];
    
    recordingState.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordingState.recordedChunks.push(event.data);
      }
    };
    
    recordingState.mediaRecorder.onstop = () => {
      finalizeRecording();
    };
    
    // Start recording
    recordingState.mediaRecorder.start(1000); // Collect data every second
    recordingState.isRecording = true;
    recordingState.startTime = Date.now();
    
    // Update UI
    startRecordingBtn.disabled = true;
    recordingTimer.style.display = 'block';
    recordingIndicator.classList.add('active');
    
    // Close recording modal
    recordingModal.classList.remove('show');
    
    // Change record button to stop button
    recordBtn.textContent = '■';
    recordBtn.style.background = '#f44336';
    recordBtn.classList.add('recording-active');
    
    // Add live clip to timeline
    addLiveClipToTimeline();
    
    // Move playhead to where recording starts
    const liveClip = timelineClips.find(clip => clip.id === recordingState.liveClipId);
    if (liveClip && liveClip.startTime !== undefined) {
      seekToTimelinePosition(liveClip.startTime);
    }
    
    // Start timer
    recordingState.timerInterval = setInterval(updateRecordingTimer, 1000);
    
    // Connect to video preview
    videoEl.srcObject = combinedStream;
    videoEl.muted = true; // Mute preview to avoid feedback
    
    // Wait for video to be ready, then start playing and preview loop
    videoEl.addEventListener('loadedmetadata', () => {
      videoEl.play().catch(err => {
        console.error('Error playing preview:', err);
      });
      // Start recording preview loop after video is ready
      startRecordingPreview();
    }, { once: true });
    
    // Also try immediately if video is already ready
    if (videoEl.readyState >= 1) {
      videoEl.play().catch(err => {
        console.error('Error playing preview:', err);
      });
      startRecordingPreview();
    } else {
      // Load the video to trigger loadedmetadata
      videoEl.load();
    }
    
  } catch (err) {
    console.error('Error starting recording:', err);
    alert('Failed to start recording: ' + err.message);
    
    // Reset button on error
    recordBtn.textContent = '🔴';
    recordBtn.style.background = '';
    recordBtn.classList.remove('recording-active');
  }
}

// Start recording preview loop
function startRecordingPreview() {
  if (recordingState.recordingPreviewFrame) {
    cancelAnimationFrame(recordingState.recordingPreviewFrame);
  }
  
  function drawRecordingFrame() {
    if (!recordingState.isRecording) {
      recordingState.recordingPreviewFrame = null;
      return;
    }
    
    // Continuously draw the video frames to canvas
    drawCompositeFrame();
    
    // Use requestAnimationFrame for smooth 60fps updates
    recordingState.recordingPreviewFrame = requestAnimationFrame(drawRecordingFrame);
  }
  
  // Start the loop immediately
  drawRecordingFrame();
}

// Update recording timer
function updateRecordingTimer() {
  if (!recordingState.isRecording) return;
  
  const elapsed = Date.now() - recordingState.startTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  recordingTimer.textContent = timeString;
}

// Stop recording
function stopRecording() {
  if (!recordingState.isRecording) return;
  
  recordingState.isRecording = false;
  
  if (recordingState.mediaRecorder && recordingState.mediaRecorder.state === 'recording') {
    recordingState.mediaRecorder.stop();
  }
  
  // Clear intervals
  if (recordingState.timerInterval) {
    clearInterval(recordingState.timerInterval);
    recordingState.timerInterval = null;
  }
  
  if (recordingState.updateInterval) {
    clearInterval(recordingState.updateInterval);
    recordingState.updateInterval = null;
  }
  
  // Stop recording preview loop
  if (recordingState.recordingPreviewFrame) {
    cancelAnimationFrame(recordingState.recordingPreviewFrame);
    recordingState.recordingPreviewFrame = null;
  }
  
  // Update UI
  startRecordingBtn.disabled = false;
  recordingIndicator.classList.remove('active');
  
  // Reset record button
  recordBtn.textContent = '🔴';
  recordBtn.style.background = '';
  recordBtn.classList.remove('recording-active');
  
  // Stop video preview
  videoEl.srcObject = null;
  
  // Return to normal timeline preview
  updateCompositePreview();
  drawCompositeFrame();
}

// Finalize recording and save file
async function finalizeRecording() {
  try {
    // Create blob from recorded chunks
    const blob = new Blob(recordingState.recordedChunks, { type: 'video/mp4' });
    
    // Convert blob to array buffer for IPC
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Save via IPC
    const result = await ipcRenderer.invoke('save-recording', uint8Array);
    
    if (result.success) {
      // Add to imported clips
      const clip = {
        id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        path: result.path,
        originalPath: result.path,
        name: result.fileName,
        duration: recordingState.recordedChunks.length > 0 ? (Date.now() - recordingState.startTime) / 1000 : 10,
        inPoint: 0,
        outPoint: recordingState.recordedChunks.length > 0 ? (Date.now() - recordingState.startTime) / 1000 : 10,
        track: 1, // Live recordings go to Track 1 (main)
        muted: false
      };
      
      importedClips.push(clip);
      renderProjectFiles();
      
      // Replace live clip with permanent clip
      finalizeLiveClip(clip);
      
      console.log('Recording saved:', result.path);
    } else {
      console.error('Failed to save recording:', result.error);
    }
    
  } catch (err) {
    console.error('Error finalizing recording:', err);
  } finally {
    // Cleanup streams
    cleanupStreams();
  }
}

// Finalize live clip
function finalizeLiveClip(savedClip) {
  if (!recordingState.liveClipId) return;
  
  const liveClipIndex = timelineClips.findIndex(clip => clip.id === recordingState.liveClipId);
  if (liveClipIndex !== -1) {
    const liveClip = timelineClips[liveClipIndex];
    
    // Update with saved clip data
    liveClip.sourceId = savedClip.id;
    liveClip.path = savedClip.path;
    liveClip.originalPath = savedClip.originalPath;
    liveClip.name = savedClip.name;
    liveClip.duration = savedClip.duration;
    liveClip.outPoint = savedClip.outPoint;
    liveClip.isLive = false;
    // Ensure track and muted properties exist (preserve Track 1 from live recording)
    if (!liveClip.hasOwnProperty('track')) {
      liveClip.track = 1; // Live recordings stay on Track 1
    }
    if (!liveClip.hasOwnProperty('muted')) {
      liveClip.muted = false;
    }
    
    renderTimeline();
    
    // Waveform will be generated automatically by renderTimeline since clip now has a path and isLive is false
  }
  
  recordingState.liveClipId = null;
}

// Cleanup streams
function cleanupStreams() {
  // Stop all tracks
  Object.values(recordingState.streams).forEach(stream => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });
  
  // Reset streams
  recordingState.streams = { desktop: null, webcam: null, audio: null };
  
  // Cleanup audio context
  if (recordingState.audioContext) {
    recordingState.audioContext.close();
    recordingState.audioContext = null;
    recordingState.analyser = null;
  }
  
  // Cleanup canvas
  recordingState.canvas = null;
  recordingState.canvasStream = null;
  
  // Reset other state
  recordingState.mediaRecorder = null;
  recordingState.recordedChunks = [];
  recordingState.startTime = null;
}

// Initialize recording DOM references
function initializeRecordingElements() {
  console.log('Initializing recording elements...');
  
  recordBtn = document.getElementById('recordBtn');
  recordingModal = document.getElementById('recording-modal');
  closeRecordingModal = document.getElementById('closeRecordingModal');
  desktopSourceSelect = document.getElementById('desktopSourceSelect');
  webcamSourceSelect = document.getElementById('webcamSourceSelect');
  microphoneSourceSelect = document.getElementById('microphoneSourceSelect');
  webcamToggle = document.getElementById('webcamToggle');
  startRecordingBtn = document.getElementById('startRecordingBtn');
  recordingTimer = document.getElementById('recordingTimer');
  recordingIndicator = document.getElementById('recordingIndicator');
  
  console.log('Record button found:', !!recordBtn);
  console.log('Recording modal found:', !!recordingModal);
  
  // Add event listeners
  if (recordBtn) {
    console.log('Adding click listener to record button');
    recordBtn.addEventListener('click', () => {
      console.log('Record button clicked!');
      // If recording is active, stop it
      if (recordingState.isRecording) {
        console.log('Stopping recording from button click');
        stopRecording();
      } else {
        // Otherwise open recording modal
        openRecordingModal();
      }
    });
  } else {
    console.error('Record button not found!');
  }
  
  if (closeRecordingModal) {
    closeRecordingModal.addEventListener('click', closeRecordingModalFunction);
  }
  
  if (webcamToggle) {
    webcamToggle.addEventListener('click', () => {
      console.log('Webcam toggle clicked, current state:', webcamToggle.classList.contains('active'));
      const wasActive = webcamToggle.classList.contains('active');
      webcamToggle.classList.toggle('active');
      const isNowActive = webcamToggle.classList.contains('active');
      
      // Update button text
      webcamToggle.textContent = isNowActive ? 'Enabled' : 'Disabled';
      
      // Enable/disable dropdown
      if (webcamSourceSelect) {
        webcamSourceSelect.disabled = !isNowActive;
        // Clear selection if disabling
        if (!isNowActive) {
          webcamSourceSelect.value = '';
        }
      }
      
      console.log('Webcam toggle new state:', isNowActive);
    });
  }
  
  if (startRecordingBtn) {
    startRecordingBtn.addEventListener('click', startRecording);
  }
  
  
  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recordingModal && recordingModal.classList.contains('show')) {
      closeRecordingModalFunction();
    }
  });
}

// ===== EVENT LISTENERS =====

// Initialize audio output device selector
async function initializeAudioOutput() {
  if (!audioOutputSelect) return;
  
  try {
    // Check if setSinkId is supported
    if (!('setSinkId' in HTMLMediaElement.prototype)) {
      console.log('Audio output selection not supported in this browser');
      audioOutputSelect.style.display = 'none';
      return;
    }
    
    // Get available audio output devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
    
    // Populate dropdown
    audioOutputSelect.innerHTML = '<option value="">Default Audio</option>';
    audioOutputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Audio Output ${audioOutputs.indexOf(device) + 1}`;
      audioOutputSelect.appendChild(option);
    });
    
    // Handle selection change
    audioOutputSelect.addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (deviceId && videoEl) {
        try {
          await videoEl.setSinkId(deviceId);
          console.log('Audio output set to:', deviceId);
        } catch (err) {
          console.error('Error setting audio output:', err);
          alert('Failed to set audio output device: ' + err.message);
        }
      } else if (videoEl) {
        // Reset to default
        try {
          await videoEl.setSinkId('');
          console.log('Audio output reset to default');
        } catch (err) {
          console.error('Error resetting audio output:', err);
        }
      }
    });
    
  } catch (err) {
    console.error('Error initializing audio output selector:', err);
    if (audioOutputSelect) {
      audioOutputSelect.style.display = 'none';
    }
  }
}

// ===== PRESS KIT GENERATION FUNCTIONS =====

// Press kit modal DOM refs
let presskitModal, closePressKitModal, presskitYesBtn, presskitNoBtn;
let presskitQuestion, presskitProgress, presskitStatus, presskitProgressBar;
let presskitError, presskitErrorMessage, presskitErrorClose;
let presskitSuccess, presskitSuccessPath, presskitSuccessClose;
let lastExportedVideoPath = null;

// Show press kit popup after export
function showPressKitPopup(videoPath) {
  if (!presskitModal) {
    console.error('Press kit modal not found!');
    return;
  }
  
  lastExportedVideoPath = videoPath;
  presskitModal.classList.add('show');
  
  // Reset to question view
  if (presskitQuestion) presskitQuestion.style.display = 'block';
  if (presskitProgress) presskitProgress.style.display = 'none';
  if (presskitError) presskitError.style.display = 'none';
  if (presskitSuccess) presskitSuccess.style.display = 'none';
}

// Close press kit modal
function closePressKitModalFunction() {
  if (presskitModal) {
    presskitModal.classList.remove('show');
  }
  lastExportedVideoPath = null;
}

// Show progress view
function showPressKitProgress(message, progress = 0) {
  if (presskitQuestion) presskitQuestion.style.display = 'none';
  if (presskitProgress) presskitProgress.style.display = 'block';
  if (presskitError) presskitError.style.display = 'none';
  if (presskitSuccess) presskitSuccess.style.display = 'none';
  
  if (presskitStatus) presskitStatus.textContent = message;
  if (presskitProgressBar) presskitProgressBar.style.width = progress + '%';
}

// Show error view
function showPressKitError(message) {
  if (presskitQuestion) presskitQuestion.style.display = 'none';
  if (presskitProgress) presskitProgress.style.display = 'none';
  if (presskitError) presskitError.style.display = 'block';
  if (presskitSuccess) presskitSuccess.style.display = 'none';
  
  if (presskitErrorMessage) presskitErrorMessage.textContent = message;
}

// Show success view
function showPressKitSuccess(filePath) {
  if (presskitQuestion) presskitQuestion.style.display = 'none';
  if (presskitProgress) presskitProgress.style.display = 'none';
  if (presskitError) presskitError.style.display = 'none';
  if (presskitSuccess) presskitSuccess.style.display = 'block';
  
  if (presskitSuccessPath) presskitSuccessPath.textContent = 'Saved to: ' + filePath;
}

// Generate press kit workflow
async function generatePressKitWorkflow() {
  if (!lastExportedVideoPath) {
    showPressKitError('No video file available');
    return;
  }
  
  // Check if credentials are configured
  try {
    const hasCredentials = await ipcRenderer.invoke('check-credentials-configured');
    if (!hasCredentials) {
      closePressKitModalFunction();
      // Show settings modal
      setTimeout(() => {
        openSettingsModal();
        if (exportStatusEl) {
          exportStatusEl.textContent = 'Please configure API credentials to use this feature';
          exportStatusEl.style.color = '#ff9800';
        }
      }, 100);
      return;
    }
  } catch (err) {
    showPressKitError('Failed to check credentials: ' + err.message);
    return;
  }
  
  try {
    // Step 1: Transcribe video
    showPressKitProgress('Transcribing video...', 25);
    const transcriptResult = await ipcRenderer.invoke('transcribe-video', lastExportedVideoPath);
    
    if (!transcriptResult || !transcriptResult.success) {
      showPressKitError(transcriptResult?.error || 'Failed to transcribe video');
      return;
    }
    
    const transcript = transcriptResult.transcript;
    if (!transcript || transcript.trim() === '') {
      showPressKitError('Transcription is empty or failed');
      return;
    }
    
    // Step 2: Extract thumbnail
    showPressKitProgress('Extracting thumbnail...', 50);
    const thumbnailResult = await ipcRenderer.invoke('extract-presskit-thumbnail', lastExportedVideoPath);
    
    if (!thumbnailResult || !thumbnailResult.success) {
      showPressKitError(thumbnailResult?.error || 'Failed to extract thumbnail');
      return;
    }
    
    const thumbnailPath = thumbnailResult.path;
    
    // Step 3: Generate press kit
    showPressKitProgress('Generating press kit with AI...', 75);
    const presskitResult = await ipcRenderer.invoke('generate-presskit', transcript, thumbnailPath);
    
    if (!presskitResult || !presskitResult.success) {
      showPressKitError(presskitResult?.error || 'Failed to generate press kit');
      return;
    }
    
    const htmlContent = presskitResult.htmlContent;
    
    // Step 4: Save HTML file
    showPressKitProgress('Saving press kit...', 90);
    const path = require('path');
    const fs = require('fs');
    const videoDir = path.dirname(lastExportedVideoPath);
    const videoName = path.basename(lastExportedVideoPath, path.extname(lastExportedVideoPath));
    const presskitPath = path.join(videoDir, `${videoName}_presskit.html`);
    
    fs.writeFileSync(presskitPath, htmlContent, 'utf8');
    
    showPressKitProgress('Complete!', 100);
    
    // Show success after a brief delay
    setTimeout(() => {
      showPressKitSuccess(presskitPath);
    }, 500);
    
  } catch (err) {
    console.error('Press kit generation error:', err);
    showPressKitError('Error: ' + err.message);
  }
}

// Initialize press kit elements
function initializePressKitElements() {
  presskitModal = document.getElementById('presskit-modal');
  closePressKitModal = document.getElementById('closePressKitModal');
  presskitYesBtn = document.getElementById('presskitYesBtn');
  presskitNoBtn = document.getElementById('presskitNoBtn');
  presskitQuestion = document.getElementById('presskit-question');
  presskitProgress = document.getElementById('presskit-progress');
  presskitStatus = document.getElementById('presskit-status');
  presskitProgressBar = document.getElementById('presskit-progress-bar');
  presskitError = document.getElementById('presskit-error');
  presskitErrorMessage = document.getElementById('presskit-error-message');
  presskitErrorClose = document.getElementById('presskit-error-close');
  presskitSuccess = document.getElementById('presskit-success');
  presskitSuccessPath = document.getElementById('presskit-success-path');
  presskitSuccessClose = document.getElementById('presskit-success-close');
  
  if (closePressKitModal) {
    closePressKitModal.addEventListener('click', closePressKitModalFunction);
  }
  
  if (presskitYesBtn) {
    presskitYesBtn.addEventListener('click', generatePressKitWorkflow);
  }
  
  if (presskitNoBtn) {
    presskitNoBtn.addEventListener('click', closePressKitModalFunction);
  }
  
  if (presskitErrorClose) {
    presskitErrorClose.addEventListener('click', closePressKitModalFunction);
  }
  
  if (presskitSuccessClose) {
    presskitSuccessClose.addEventListener('click', closePressKitModalFunction);
  }
  
  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && presskitModal && presskitModal.classList.contains('show')) {
      closePressKitModalFunction();
    }
  });
}

// ===== SETTINGS MODAL FUNCTIONS =====

// Settings modal DOM refs
let settingsModal, settingsBtn, closeSettingsModal, cancelSettingsBtn, saveSettingsBtn;
let openaiKeyInput, awsAccessKeyIdInput, awsSecretAccessKeyInput, awsRegionInput;
let toggleOpenAIKey, toggleAWSSecret, encryptionStatus;

// Validate OpenAI API key
function validateOpenAIKey(key) {
  if (!key || key.trim() === '') {
    return 'API key is required';
  }
  if (!key.startsWith('sk-')) {
    return 'Invalid API key format (should start with sk-)';
  }
  if (key.length < 20) {
    return 'API key appears to be too short';
  }
  return null;
}

// Validate AWS region
function validateAWSRegion(region) {
  if (!region || region.trim() === '') {
    return 'Region is required';
  }
  // Basic region format validation (e.g., us-east-1)
  const regionPattern = /^[a-z]+-[a-z]+-\d+$/;
  if (!regionPattern.test(region)) {
    return 'Invalid region format (expected format: us-east-1)';
  }
  return null;
}

// Show error in field
function showFieldError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById(errorId);
  if (field) field.classList.add('error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

// Clear error from field
function clearFieldError(fieldId, errorId) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById(errorId);
  if (field) field.classList.remove('error');
  if (errorEl) errorEl.style.display = 'none';
}

// Load settings from storage (masked)
async function loadSettingsFromStorage() {
  try {
    const config = await ipcRenderer.invoke('get-api-config');
    if (config) {
      if (config.hasOpenAI && openaiKeyInput) {
        openaiKeyInput.placeholder = 'API key is configured';
      }
      if (config.hasAWS && awsAccessKeyIdInput) {
        awsAccessKeyIdInput.placeholder = 'Access Key ID is configured';
      }
      if (config.hasAWS && awsSecretAccessKeyInput) {
        awsSecretAccessKeyInput.placeholder = 'Secret Access Key is configured';
      }
      if (config.hasRegion && awsRegionInput) {
        awsRegionInput.value = config.awsRegion;
      }
      
      // Update encryption status
      if (encryptionStatus) {
        if (config.encryptionAvailable) {
          encryptionStatus.textContent = '✓ Encryption is available and credentials are secured';
          encryptionStatus.className = 'settings-status encrypted';
        } else {
          encryptionStatus.textContent = '⚠ Encryption is not available on this system. Credentials will be stored in plain text.';
          encryptionStatus.className = 'settings-status not-encrypted';
        }
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Open settings modal
async function openSettingsModal() {
  if (!settingsModal) {
    console.error('Settings modal not found!');
    return;
  }
  
  settingsModal.classList.add('show');
  
  // Clear all errors
  clearFieldError('openaiKeyInput', 'openaiKeyError');
  clearFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError');
  clearFieldError('awsSecretAccessKeyInput', 'awsSecretAccessKeyError');
  clearFieldError('awsRegionInput', 'awsRegionError');
  
  // Clear inputs (except region if already set)
  if (openaiKeyInput) openaiKeyInput.value = '';
  if (awsAccessKeyIdInput) awsAccessKeyIdInput.value = '';
  if (awsSecretAccessKeyInput) awsSecretAccessKeyInput.value = '';
  
  // Load current settings
  await loadSettingsFromStorage();
}

// Close settings modal
function closeSettingsModalFunction() {
  if (settingsModal) {
    settingsModal.classList.remove('show');
  }
  // Reset all inputs and errors
  if (openaiKeyInput) {
    openaiKeyInput.value = '';
    openaiKeyInput.type = 'password';
  }
  if (awsSecretAccessKeyInput) {
    awsSecretAccessKeyInput.value = '';
    awsSecretAccessKeyInput.type = 'password';
  }
  clearFieldError('openaiKeyInput', 'openaiKeyError');
  clearFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError');
  clearFieldError('awsSecretAccessKeyInput', 'awsSecretAccessKeyError');
  clearFieldError('awsRegionInput', 'awsRegionError');
}

// Save settings
async function saveSettings() {
  // Clear all errors first
  clearFieldError('openaiKeyInput', 'openaiKeyError');
  clearFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError');
  clearFieldError('awsSecretAccessKeyInput', 'awsSecretAccessKeyError');
  clearFieldError('awsRegionInput', 'awsRegionError');
  
  let hasErrors = false;
  
  // Validate OpenAI key
  const openaiKey = openaiKeyInput ? openaiKeyInput.value.trim() : '';
  if (openaiKey) {
    const openaiError = validateOpenAIKey(openaiKey);
    if (openaiError) {
      showFieldError('openaiKeyInput', 'openaiKeyError', openaiError);
      hasErrors = true;
    }
  }
  
  // Validate AWS credentials (all or none)
  const awsAccessKeyId = awsAccessKeyIdInput ? awsAccessKeyIdInput.value.trim() : '';
  const awsSecretAccessKey = awsSecretAccessKeyInput ? awsSecretAccessKeyInput.value.trim() : '';
  const awsRegion = awsRegionInput ? awsRegionInput.value.trim() : '';
  
  if (awsAccessKeyId || awsSecretAccessKey || awsRegion) {
    if (!awsAccessKeyId) {
      showFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError', 'Access Key ID is required');
      hasErrors = true;
    }
    if (!awsSecretAccessKey) {
      showFieldError('awsSecretAccessKeyInput', 'awsSecretAccessKeyError', 'Secret Access Key is required');
      hasErrors = true;
    }
    if (!awsRegion) {
      showFieldError('awsRegionInput', 'awsRegionError', 'Region is required');
      hasErrors = true;
    } else {
      const regionError = validateAWSRegion(awsRegion);
      if (regionError) {
        showFieldError('awsRegionInput', 'awsRegionError', regionError);
        hasErrors = true;
      }
    }
  }
  
  if (hasErrors) {
    return;
  }
  
  // Save OpenAI key if provided
  if (openaiKey) {
    try {
      const result = await ipcRenderer.invoke('set-openai-key', openaiKey);
      if (!result.success) {
        showFieldError('openaiKeyInput', 'openaiKeyError', result.error || 'Failed to save API key');
        return;
      }
    } catch (err) {
      showFieldError('openaiKeyInput', 'openaiKeyError', 'Error saving API key: ' + err.message);
      return;
    }
  }
  
  // Save AWS credentials if provided
  if (awsAccessKeyId && awsSecretAccessKey && awsRegion) {
    try {
      const result = await ipcRenderer.invoke('set-aws-credentials', awsAccessKeyId, awsSecretAccessKey, awsRegion);
      if (!result.success) {
        showFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError', result.error || 'Failed to save AWS credentials');
        return;
      }
    } catch (err) {
      showFieldError('awsAccessKeyIdInput', 'awsAccessKeyIdError', 'Error saving AWS credentials: ' + err.message);
      return;
    }
  }
  
  // Success - close modal
  closeSettingsModalFunction();
  
  // Show success message (optional)
  if (exportStatusEl) {
    const prevStatus = exportStatusEl.textContent;
    exportStatusEl.textContent = 'Settings saved successfully';
    exportStatusEl.style.color = '#4caf50';
    setTimeout(() => {
      exportStatusEl.textContent = prevStatus;
      exportStatusEl.style.color = '#999';
    }, 2000);
  }
}

// Initialize settings elements
function initializeSettingsElements() {
  settingsModal = document.getElementById('settings-modal');
  settingsBtn = document.getElementById('settingsBtn');
  closeSettingsModal = document.getElementById('closeSettingsModal');
  cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  saveSettingsBtn = document.getElementById('saveSettingsBtn');
  openaiKeyInput = document.getElementById('openaiKeyInput');
  awsAccessKeyIdInput = document.getElementById('awsAccessKeyIdInput');
  awsSecretAccessKeyInput = document.getElementById('awsSecretAccessKeyInput');
  awsRegionInput = document.getElementById('awsRegionInput');
  toggleOpenAIKey = document.getElementById('toggleOpenAIKey');
  toggleAWSSecret = document.getElementById('toggleAWSSecret');
  encryptionStatus = document.getElementById('encryptionStatus');
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }
  
  if (closeSettingsModal) {
    closeSettingsModal.addEventListener('click', closeSettingsModalFunction);
  }
  
  if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', closeSettingsModalFunction);
  }
  
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  // Toggle password visibility
  if (toggleOpenAIKey && openaiKeyInput) {
    toggleOpenAIKey.addEventListener('click', () => {
      const isPassword = openaiKeyInput.type === 'password';
      openaiKeyInput.type = isPassword ? 'text' : 'password';
      toggleOpenAIKey.textContent = isPassword ? 'Hide' : 'Show';
    });
  }
  
  if (toggleAWSSecret && awsSecretAccessKeyInput) {
    toggleAWSSecret.addEventListener('click', () => {
      const isPassword = awsSecretAccessKeyInput.type === 'password';
      awsSecretAccessKeyInput.type = isPassword ? 'text' : 'password';
      toggleAWSSecret.textContent = isPassword ? 'Hide' : 'Show';
    });
  }
  
  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal && settingsModal.classList.contains('show')) {
      closeSettingsModalFunction();
    }
  });
}

// Init - wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  initializeAudioOutput();
  initializeRecordingElements();
  initializeSettingsElements();
  initializePressKitElements();
  setupClipDragAndResize();
  setupTimelineClickSeek();
  setupTimelineContextMenu();
  setupSynchronizedScrolling(); // Sync track scrolling
  setupCanvasSize(); // Initialize canvas size
  
  // Auto-adjust initial zoom to fill screen better
  if (timelineScrollWrapper && timelineClips.length === 0) {
    const viewportWidth = timelineScrollWrapper.clientWidth || 800;
    // Aim for about 30 seconds visible by default (or fill viewport)
    const targetVisibleDuration = 30;
    timelineZoom = Math.max(30, (viewportWidth - 100) / targetVisibleDuration);
  }
  
  updateZoomDisplay(); // Initialize zoom display
  renderProjectFiles();
  renderTimeline(); // This will also render the ruler
  renderTimelineRuler(); // Explicitly render ruler to ensure it appears on initial load
  updateCompositePreview(); // Initial preview update
});

// Also try immediate initialization as fallback
if (document.readyState === 'loading') {
  console.log('DOM still loading, waiting...');
} else {
  console.log('DOM already loaded, initializing immediately');
  initializeAudioOutput();
  initializeRecordingElements();
  initializeSettingsElements();
  initializePressKitElements();
  setupClipDragAndResize();
  setupTimelineClickSeek();
  setupTimelineContextMenu();
  setupSynchronizedScrolling(); // Sync track scrolling
  setupCanvasSize();
  
  // Auto-adjust initial zoom to fill screen better
  if (timelineScrollWrapper && timelineClips.length === 0) {
    const viewportWidth = timelineScrollWrapper.clientWidth || 800;
    // Aim for about 30 seconds visible by default (or fill viewport)
    const targetVisibleDuration = 30;
    timelineZoom = Math.max(30, (viewportWidth - 100) / targetVisibleDuration);
  }
  
  updateZoomDisplay(); // Initialize zoom display
  renderProjectFiles();
  renderTimeline(); // This will also render the ruler
  renderTimelineRuler(); // Explicitly render ruler to ensure it appears on initial load
  updateCompositePreview();
}
