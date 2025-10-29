"use strict";

const { ipcRenderer } = require('electron');

// Data model: separate imported clips from timeline clips
let importedClips = []; // Clips in the media library
let timelineClips = []; // Clips on the timeline
let selectedClipIndex = null;
let timelineZoom = 50; // pixels per second
let timelineCurrentTime = 0; // Global timeline position (seconds)

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
  updateInterval: null
};

// DOM refs
const dropzone = document.getElementById('dropzone');
const projectFilesList = document.getElementById('project-files-list');
const trackContent = document.getElementById('track-1-content');
const videoEl = document.getElementById('video');
const inPointInput = document.getElementById('inPointInput');
const outPointInput = document.getElementById('outPointInput');
const applyTrimBtn = document.getElementById('applyTrimBtn');
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

// Recording DOM refs - will be initialized after DOM loads
let recordBtn, recordingModal, closeRecordingModal, desktopSourceSelect, webcamSourceSelect, microphoneSourceSelect, webcamToggle, audioMeterBar, startRecordingBtn, stopRecordingBtn, recordingTimer, recordingIndicator;

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
  // Clear existing clips (but keep playhead)
  const existingClips = trackContent.querySelectorAll('.timeline-clip');
  existingClips.forEach(el => el.remove());
  
  timelineClips.forEach((clip, idx) => {
    const duration = clip.duration || 10;
    const trimmedDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : duration;
    const width = trimmedDuration * timelineZoom;
    
    const el = document.createElement('div');
    el.className = 'timeline-clip';
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
      clip.thumbnails.forEach(thumbPath => {
        const img = document.createElement('img');
        img.className = 'timeline-clip-thumbnail';
        img.src = thumbPath;
        img.style.width = '50px';
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
    
    trackContent.appendChild(el);
  });
  
  renderTimelineRuler();
}

// Select a timeline clip
function selectTimelineClip(idx) {
  selectedClipIndex = idx;
  const clip = timelineClips[idx];
  
  // Update properties panel
  if (inPointInput) inPointInput.value = clip.inPoint || 0;
  if (outPointInput) outPointInput.value = clip.outPoint || clip.duration || 0;
  
  // Update visual selection
  trackContent.querySelectorAll('.timeline-clip').forEach(el => {
    el.classList.remove('selected');
  });
  const selectedEl = trackContent.querySelector(`[data-clip-index="${idx}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected');
  }
  
  // Load video preview
  videoEl.src = clip.path;
  videoEl.load();
  
  // Set to start at inPoint
  videoEl.addEventListener('loadedmetadata', () => {
    videoEl.currentTime = clip.inPoint || 0;
  }, { once: true });
}

// Render timeline ruler
function renderTimelineRuler() {
  timelineRuler.innerHTML = '';
  
  // Calculate total timeline duration
  let totalDuration = 0;
  timelineClips.forEach(clip => {
    const clipEnd = (clip.startTime || 0) + (clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : (clip.duration || 10));
    totalDuration = Math.max(totalDuration, clipEnd);
  });
  
  // Add some padding
  totalDuration += 5;
  
  // Determine marker interval based on zoom
  let interval = 1; // seconds
  if (timelineZoom < 20) interval = 5;
  else if (timelineZoom < 40) interval = 2;
  
  for (let t = 0; t <= totalDuration; t += interval) {
    const marker = document.createElement('div');
    marker.className = 'ruler-marker';
    marker.style.left = (t * timelineZoom) + 'px';
    
    // Format as HH:MM:SS.mmm
    const hours = Math.floor(t / 3600);
    const minutes = Math.floor((t % 3600) / 60);
    const seconds = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    marker.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    
    timelineRuler.appendChild(marker);
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
async function addClipToTimeline(clipId) {
  const sourceClip = importedClips.find(c => c.id === clipId);
  if (!sourceClip) return;
  
  // Calculate start time (end of last clip)
  let startTime = 0;
  if (timelineClips.length > 0) {
    const lastClip = timelineClips[timelineClips.length - 1];
    const lastDuration = lastClip.outPoint > 0 ? (lastClip.outPoint - lastClip.inPoint) : lastClip.duration;
    startTime = (lastClip.startTime || 0) + lastDuration;
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
    thumbnails: [],
    thumbnailsLoading: true,
  };
  
  timelineClips.push(timelineClip);
  renderTimeline();
  
  // Auto-select first clip added to timeline
  if (selectedClipIndex == null) {
    selectTimelineClip(0);
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
trackContent.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

trackContent.addEventListener('drop', (e) => {
  e.preventDefault();
  const clipId = e.dataTransfer.getData('text/plain');
  if (clipId) {
    addClipToTimeline(clipId);
  }
});

// Transport controls
playPauseBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play();
    playPauseBtn.textContent = '⏸';
  } else {
    videoEl.pause();
    playPauseBtn.textContent = '▶';
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

// Update playhead position
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
  playhead.style.left = (timelineCurrentTime * timelineZoom) + 'px';
  
  // Auto-scroll timeline to keep playhead in view
  const playheadPixelPos = timelineCurrentTime * timelineZoom;
  const containerWidth = trackContent.clientWidth;
  const scrollLeft = trackContent.scrollLeft;
  const visibleLeft = scrollLeft;
  const visibleRight = scrollLeft + containerWidth;
  
  // Scale edge threshold based on zoom level (roughly 2 seconds of time at default zoom)
  const edgeThreshold = 2 * timelineZoom;
  
  // If playhead is outside visible area, scroll to center it
  const targetPos = playheadPixelPos - (containerWidth / 2);
  if (playheadPixelPos < visibleLeft + edgeThreshold) {
    // Playhead approaching left edge, scroll left
    trackContent.scrollLeft = Math.max(0, targetPos);
  } else if (playheadPixelPos > visibleRight - edgeThreshold) {
    // Playhead approaching right edge, scroll right
    trackContent.scrollLeft = Math.max(0, targetPos);
  }
  
  // Check if we've reached the outPoint of current clip
  if (clip && clip.outPoint > 0 && videoEl.currentTime >= clip.outPoint) {
    videoEl.pause();
    // Trigger ended event to move to next clip
    videoEl.dispatchEvent(new Event('ended'));
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

// Timeline click to seek
trackContent.addEventListener('click', (e) => {
  if (e.target.classList.contains('timeline-clip') || 
      e.target.classList.contains('timeline-clip-label') ||
      e.target.classList.contains('timeline-clip-resize-handle') ||
      e.target.id === 'playhead') {
    return;
  }
  
  seekToTimelinePosition(e);
});

// Playhead dragging
let isPlayheadDragging = false;
playhead.addEventListener('mousedown', (e) => {
  isPlayheadDragging = true;
  document.body.style.cursor = 'pointer';
});

document.addEventListener('mousemove', (e) => {
  if (!isPlayheadDragging) return;
  
  const rect = trackContent.getBoundingClientRect();
  const x = e.clientX - rect.left + trackContent.scrollLeft;
  const time = x / timelineZoom;
  
  seekToTimelinePosition(time);
});

document.addEventListener('mouseup', () => {
  isPlayheadDragging = false;
  document.body.style.cursor = '';
});

// Helper function to seek to a timeline position
function seekToTimelinePosition(eventOrTime) {
  let time;
  
  if (typeof eventOrTime === 'number') {
    time = eventOrTime;
  } else {
    const rect = trackContent.getBoundingClientRect();
    const x = eventOrTime.clientX - rect.left + trackContent.scrollLeft;
    time = x / timelineZoom;
  }
  
  // Find which clip this time falls into
  for (let i = 0; i < timelineClips.length; i++) {
    const clip = timelineClips[i];
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    if (time >= clipStart && time < clipEnd) {
      // Select the clip if it's not already selected
      if (selectedClipIndex !== i) {
        selectTimelineClip(i);
      }
      // Seek to the position within this clip
      const clipLocalTime = clip.inPoint + (time - clipStart);
      videoEl.currentTime = clipLocalTime;
      timelineCurrentTime = time;
      return;
    }
  }
}

// Zoom controls
zoomInBtn.addEventListener('click', () => {
  timelineZoom = Math.min(200, timelineZoom + 10);
  renderTimeline();
});

zoomOutBtn.addEventListener('click', () => {
  timelineZoom = Math.max(10, timelineZoom - 10);
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
function recalculateTimelinePositions() {
  let currentTime = 0;
  timelineClips.forEach(clip => {
    clip.startTime = currentTime;
    const duration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    currentTime += duration;
  });
}

// Export
function exportConcatenated() {
  if (timelineClips.length === 0) {
    setExportStatus('No clips on timeline to export', '#ff4444');
    return;
  }
  
  setExportStatus('Starting export...', '#4a9eff');
  ipcRenderer.invoke('export-video', timelineClips)
    .then((response) => {
      if (response && response.success) {
        setExportStatus('Export completed: ' + (response.path || 'unknown'), '#4caf50');
      } else {
        setExportStatus('Export failed' + (response && response.error ? ': ' + response.error : ''), '#ff4444');
      }
    })
    .catch((err) => {
      setExportStatus('Export error: ' + err.message, '#ff4444');
    });
}

exportBtn?.addEventListener('click', exportConcatenated);

// Cancel export with Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('cancel-export');
    setExportStatus('Export canceled', '#ff4444');
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

// Setup drag and resize handlers
function setupClipDragAndResize() {
  trackContent.addEventListener('mousedown', (e) => {
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
      document.body.style.cursor = 'ew-resize';
      return;
    }
    
    // Otherwise, setup for dragging to reorder
    dragState.isDragging = true;
    dragState.draggedClipIndex = clipIndex;
    dragState.startX = e.clientX;
    dragState.startLeft = parseFloat(clipEl.style.left);
    clipEl.style.opacity = '0.6';
    clipEl.style.zIndex = '1000';
    document.body.style.cursor = 'grabbing';
  });
  
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
  const clipEl = trackContent.querySelector(`[data-clip-index="${clipIndex}"]`);
  if (!clip || !clipEl) return;
  
  const deltaX = e.clientX - dragState.startX;
  const deltaTime = deltaX / timelineZoom;
  
  if (dragState.resizeHandle === 'left') {
    // Resize left edge (adjust inPoint)
    const newInPoint = Math.max(0, dragState.originalInPoint + deltaTime);
    const maxInPoint = clip.duration - 0.1; // Minimum 0.1s duration
    
    if (newInPoint < maxInPoint) {
      clip.inPoint = newInPoint;
      
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
  const clipEl = trackContent.querySelector(`[data-clip-index="${clipIndex}"]`);
  if (!clipEl) return;
  
  const deltaX = e.clientX - dragState.startX;
  const newLeft = dragState.startLeft + deltaX;
  clipEl.style.left = newLeft + 'px';
}

function finishDrag() {
  const clipIndex = dragState.draggedClipIndex;
  const clipEl = trackContent.querySelector(`[data-clip-index="${clipIndex}"]`);
  
  if (clipEl) {
    clipEl.style.opacity = '';
    clipEl.style.zIndex = '';
    
    // Calculate new position in timeline
    const newLeft = parseFloat(clipEl.style.left);
    const newTime = newLeft / timelineZoom;
    
    // Find where to insert this clip based on time
    const draggedClip = timelineClips[clipIndex];
    timelineClips.splice(clipIndex, 1); // Remove from current position
    
    // Find insertion point
    let insertIndex = 0;
    for (let i = 0; i < timelineClips.length; i++) {
      if (timelineClips[i].startTime < newTime) {
        insertIndex = i + 1;
      }
    }
    
    // Insert at new position
    timelineClips.splice(insertIndex, 0, draggedClip);
    
    // Update selected index if needed
    if (selectedClipIndex === clipIndex) {
      selectedClipIndex = insertIndex;
    }
  }
  
  dragState.isDragging = false;
  dragState.draggedClipIndex = null;
  document.body.style.cursor = '';
  
  // Recalculate timeline positions
  recalculateTimelinePositions();
  renderTimeline();
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
        option.textContent = `${source.type === 'screen' ? 'Screen' : 'Window'}: ${source.name}`;
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
      option.textContent = device.label || `Camera ${device.deviceId.substring(0, 8)}`;
      webcamSourceSelect.appendChild(option);
    });
    
    // Get microphone sources
    const audioDevices = webcamDevices.filter(device => device.kind === 'audioinput');
    microphoneSourceSelect.innerHTML = '<option value="">Select microphone...</option>';
    audioDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${device.deviceId.substring(0, 8)}`;
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
  webcamToggle.textContent = 'None';
  webcamToggle.classList.remove('active');
  audioMeterBar.style.width = '0%';
  recordingTimer.style.display = 'none';
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
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
      recordingState.streams.audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: microphoneSourceId }
        },
        video: false
      });
      
      // Setup audio level meter
      setupAudioMeter(recordingState.streams.audio);
    }
    
    return true;
  } catch (err) {
    console.error('Error initializing streams:', err);
    return false;
  }
}

// Setup audio level meter
function setupAudioMeter(audioStream) {
  recordingState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  recordingState.analyser = recordingState.audioContext.createAnalyser();
  const source = recordingState.audioContext.createMediaStreamSource(audioStream);
  
  source.connect(recordingState.analyser);
  recordingState.analyser.fftSize = 256;
  
  updateAudioMeter();
}

// Update audio level meter
function updateAudioMeter() {
  if (!recordingState.analyser) return;
  
  const dataArray = new Uint8Array(recordingState.analyser.frequencyBinCount);
  recordingState.analyser.getByteFrequencyData(dataArray);
  
  // Calculate average volume
  const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  const percentage = Math.min(100, (average / 255) * 100);
  
  audioMeterBar.style.width = percentage + '%';
  
  if (recordingState.isRecording) {
    requestAnimationFrame(updateAudioMeter);
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
  
  // Calculate start time (after last clip)
  let startTime = 0;
  if (timelineClips.length > 0) {
    const lastClip = timelineClips[timelineClips.length - 1];
    const lastDuration = lastClip.outPoint > 0 ? (lastClip.outPoint - lastClip.inPoint) : lastClip.duration;
    startTime = (lastClip.startTime || 0) + lastDuration;
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
    if (recordingState.streams.audio) {
      tracks.push(...recordingState.streams.audio.getTracks());
    }
    
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
    stopRecordingBtn.disabled = false;
    recordingTimer.style.display = 'block';
    recordingIndicator.classList.add('active');
    
    // Add live clip to timeline
    addLiveClipToTimeline();
    
    // Start timer
    recordingState.timerInterval = setInterval(updateRecordingTimer, 1000);
    
    // Connect to video preview
    videoEl.srcObject = combinedStream;
    
  } catch (err) {
    console.error('Error starting recording:', err);
    alert('Failed to start recording: ' + err.message);
  }
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
  
  // Update UI
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
  recordingIndicator.classList.remove('active');
  
  // Stop video preview
  videoEl.srcObject = null;
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
        outPoint: recordingState.recordedChunks.length > 0 ? (Date.now() - recordingState.startTime) / 1000 : 10
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
    
    renderTimeline();
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
  audioMeterBar = document.getElementById('audioMeterBar');
  startRecordingBtn = document.getElementById('startRecordingBtn');
  stopRecordingBtn = document.getElementById('stopRecordingBtn');
  recordingTimer = document.getElementById('recordingTimer');
  recordingIndicator = document.getElementById('recordingIndicator');
  
  console.log('Record button found:', !!recordBtn);
  console.log('Recording modal found:', !!recordingModal);
  
  // Add event listeners
  if (recordBtn) {
    console.log('Adding click listener to record button');
    recordBtn.addEventListener('click', () => {
      console.log('Record button clicked!');
      alert('Record button clicked!'); // Temporary debug alert
      openRecordingModal();
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
      webcamToggle.classList.toggle('active');
      webcamToggle.textContent = webcamToggle.classList.contains('active') ? 'Enabled' : 'None';
      console.log('Webcam toggle new state:', webcamToggle.classList.contains('active'));
    });
  }
  
  if (startRecordingBtn) {
    startRecordingBtn.addEventListener('click', startRecording);
  }
  
  if (stopRecordingBtn) {
    stopRecordingBtn.addEventListener('click', stopRecording);
  }
  
  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recordingModal && recordingModal.classList.contains('show')) {
      closeRecordingModalFunction();
    }
  });
}

// ===== EVENT LISTENERS =====

// Init - wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  initializeRecordingElements();
setupClipDragAndResize();
renderProjectFiles();
renderTimeline();
});

// Also try immediate initialization as fallback
if (document.readyState === 'loading') {
  console.log('DOM still loading, waiting...');
} else {
  console.log('DOM already loaded, initializing immediately');
  initializeRecordingElements();
  setupClipDragAndResize();
  renderProjectFiles();
  renderTimeline();
}
