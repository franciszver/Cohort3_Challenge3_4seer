"use strict";

const { ipcRenderer } = require('electron');

// Minimal in-memory data model for clips
let clips = [];
let currentClipId = null;
let selectedClipIndex = null;

// DOM refs
const dropzone = document.getElementById('dropzone');
const timelineEl = document.getElementById('timeline');
const videoEl = document.getElementById('video');
const inPointInput = document.getElementById('inPointInput');
const outPointInput = document.getElementById('outPointInput');
const applyTrimBtn = document.getElementById('applyTrimBtn');
const exportBtn = document.getElementById('exportBtn');
// status element for export feedback
const exportStatusEl = document.getElementById('exportStatus');
// simple progress bar for export (visual)
const exportProgressBar = document.getElementById('exportProgressBar');
function setExportStatus(message, color) {
  if (!exportStatusEl) return;
  exportStatusEl.textContent = message;
  exportStatusEl.style.color = color || '#333';
}

// Render timeline with selection highlighting
function renderTimeline() {
  timelineEl.innerHTML = '';
  clips.forEach((clip, idx) => {
    const el = document.createElement('div');
    el.className = 'clip';
    el.style.cssText = 'width:160px; height:60px; padding:8px; background:#ddd; border-radius:6px; margin-right:8px; display:inline-block; text-align:center;';
    el.textContent = `Clip ${idx + 1}`;
    el.dataset.id = clip.id;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      currentClipId = clip.id;
      selectedClipIndex = idx;
      // reflect selection
      timelineEl.querySelectorAll('.clip').forEach(n => n.style.outline = 'none');
      el.style.outline = '2px solid #0078d7';
      // populate trim inputs from clip
      if (typeof clip.inPoint === 'number' && inPointInput) inPointInput.value = clip.inPoint;
      if (typeof clip.outPoint === 'number' && outPointInput) outPointInput.value = clip.outPoint;
      // preview
      videoEl.src = clip.path;
      videoEl.load();
      videoEl.play();
    });
    // highlight if this is the selected clip
    if (selectedClipIndex === idx) {
      el.style.outline = '2px solid #0078d7';
    } else {
      el.style.outline = 'none';
    }
    timelineEl.appendChild(el);
  });
}

// Add a new clip from a file path (copies to temp location first)
async function addClipFromFile(filePath) {
  try {
    // Copy file to temp location via IPC
    const result = await ipcRenderer.invoke('import-file', filePath);
    if (!result || !result.success) {
      console.error('Failed to import file:', result?.error);
      return;
    }
    
    const id = 'clip_' + (clips.length + 1);
    // Use temp path for processing, but store original for display
    const clip = { 
      id, 
      path: result.tempPath, 
      originalPath: result.originalPath,
      inPoint: 0, 
      outPoint: 0, 
      order: clips.length 
    };
    clips.push(clip);
    selectedClipIndex = clips.length - 1;
    renderTimeline();
    // reflect initial trim in inputs
    if (inPointInput) inPointInput.value = clip.inPoint;
    if (outPointInput) outPointInput.value = clip.outPoint;
    // highlight new clip
    const lastEl = timelineEl.querySelector('.clip:last-child');
    if (lastEl) {
      timelineEl.querySelectorAll('.clip').forEach(n => n.style.outline = 'none');
      lastEl.style.outline = '2px solid #0078d7';
    }
  } catch (err) {
    console.error('Error adding clip:', err);
  }
}

// Drag & drop
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []);
  const mp4Files = files.filter(f => f.path.toLowerCase().endsWith('.mp4') || f.path.toLowerCase().endsWith('.mov'));
  mp4Files.forEach(f => addClipFromFile(f.path));
});

// Click-to-select fallback
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'video/mp4,video/quicktime';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) addClipFromFile(f.path);
});

// Export
function exportConcatenated() {
  setExportStatus('Starting export...', '#000');
  ipcRenderer.invoke('export-video', clips)
    .then((response) => {
      if (response && response.success) {
        setExportStatus('Export completed: ' + (response.path || 'unknown'), '#0a0');
      } else {
        setExportStatus('Export failed' + (response && response.error ? ': ' + response.error : ''), '#c00');
      }
    })
    .catch((err) => {
      setExportStatus('Export error: ' + err.message, '#c00');
    });
}
// Cancel export with Escape key (simple UX)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('cancel-export');
    setExportStatus('Export canceled', '#c00');
  }
});
ipcRenderer.on('export-complete', () => {
  // handle
});

// Listen for progress updates from the main process during export
ipcRenderer.on('export-progress', (event, payload) => {
  if (!payload) return;
  const { segmentIndex, total, message, color } = payload;
  setExportStatus(message || 'Export in progress', color);
  if (exportProgressBar && typeof segmentIndex === 'number' && typeof total === 'number') {
    const pct = Math.min(100, Math.max(0, Math.round((segmentIndex / total) * 100)));
    exportProgressBar.style.width = pct + '%';
  }
});

// Wire UI elements
exportBtn?.addEventListener('click', exportConcatenated);

// Trim panel wiring
if (applyTrimBtn) {
  applyTrimBtn.addEventListener('click', () => {
    if (selectedClipIndex == null || !clips[selectedClipIndex]) return;
    const clip = clips[selectedClipIndex];
    let inVal = parseFloat(inPointInput?.value);
    let outVal = parseFloat(outPointInput?.value);
    if (Number.isNaN(inVal)) inVal = 0;
    if (Number.isNaN(outVal)) outVal = 0;
    // Basic validation: ensure non-negative and out > in
    if (outVal <= inVal) {
      outVal = inVal + 0.1; // small epsilon
    }
    clip.inPoint = inVal;
    clip.outPoint = outVal;
    renderTimeline();
  });
}

// Init
renderTimeline();


