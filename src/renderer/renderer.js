"use strict";

const { ipcRenderer } = require('electron');

// Data model: separate imported clips from timeline clips
let importedClips = []; // Clips in the media library
let timelineClips = []; // Clips on the timeline
let selectedClipIndex = null;
let timelineZoom = 50; // pixels per second

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
  videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
});

forwardBtn.addEventListener('click', () => {
  videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 5);
});

// Update playhead position
videoEl.addEventListener('timeupdate', () => {
  if (!videoEl.duration) return;
  const currentTime = videoEl.currentTime;
  playhead.style.left = (currentTime * timelineZoom) + 'px';
  
  // Check if we've reached the outPoint of current clip
  if (selectedClipIndex != null && timelineClips[selectedClipIndex]) {
    const clip = timelineClips[selectedClipIndex];
    if (clip.outPoint > 0 && currentTime >= clip.outPoint) {
      videoEl.pause();
      // Trigger ended event to move to next clip
      videoEl.dispatchEvent(new Event('ended'));
    }
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
      e.target.classList.contains('timeline-clip-resize-handle')) {
    return;
  }
  
  const rect = trackContent.getBoundingClientRect();
  const x = e.clientX - rect.left + trackContent.scrollLeft;
  const time = x / timelineZoom;
  
  // Find which clip this time falls into
  for (let i = 0; i < timelineClips.length; i++) {
    const clip = timelineClips[i];
    const clipStart = clip.startTime || 0;
    const clipDuration = clip.outPoint > 0 ? (clip.outPoint - clip.inPoint) : clip.duration;
    const clipEnd = clipStart + clipDuration;
    
    if (time >= clipStart && time < clipEnd) {
      selectTimelineClip(i);
      videoEl.currentTime = clip.inPoint + (time - clipStart);
      break;
    }
  }
});

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

// Init
setupClipDragAndResize();
renderProjectFiles();
renderTimeline();
