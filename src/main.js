const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Temp directory for imported files
let tempDir = null;

function getTempDir() {
  if (!tempDir) {
    tempDir = path.join(os.tmpdir(), '4seer_mvp_' + Date.now());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  }
  return tempDir;
}

function cleanupTempDir() {
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    } catch (err) {
      console.error('Failed to cleanup temp dir:', err);
    }
  }
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('src/renderer/index.html');
  // Open external links in default browser
  win.webContents.on('new-window', (e, url) => {
    e.preventDefault();
    shell.openExternal(url);
  });

  // Cleanup temp dir when window closes
  win.on('closed', () => {
    cleanupTempDir();
  });
}

app.whenReady().then(() => {
  // Cleanup any old temp dirs on startup
  cleanupTempDir();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// IPC: handle export workflow from renderer
ipcMain.handle('export-video', async (event, clips) => {
  try {
    event.sender.send('export-progress', { message: 'Starting export...' });
    const result = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'output.mp4',
      filters: [ { name: 'Video', extensions: ['mp4'] } ]
    });
    if (!result || result.canceled || !result.filePath) {
      return { success: false, reason: 'canceled' };
    }
    event.sender.send('export-progress', { message: 'Export in progress...' });
    const { exportConcat } = require('./ffmpeg/wrapper');
    await exportConcat(clips, result.filePath, (p) => {
      event.sender.send('export-progress', p);
    });
    event.sender.send('export-progress', { message: 'Export complete', color: '#0a0' });
    return { success: true, path: result.filePath };
  } catch (err) {
    event.sender.send('export-progress', { message: 'Export failed: ' + err.message, color: '#c00' });
    return { success: false, error: err.message };
  }
});

// Allow cancellation from renderer
ipcMain.on('cancel-export', () => {
  try { const { cancelExport } = require('./ffmpeg/wrapper'); cancelExport(); } catch {}
});

// IPC: Copy imported file to temp location
ipcMain.handle('import-file', async (event, originalPath) => {
  try {
    const tempDirPath = getTempDir();
    const fileName = path.basename(originalPath);
    // Add timestamp to avoid collisions
    const timestamp = Date.now();
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const tempFileName = `${baseName}_${timestamp}${ext}`;
    const tempFilePath = path.join(tempDirPath, tempFileName);
    
    // Copy file to temp location
    fs.copyFileSync(originalPath, tempFilePath);
    
    return { success: true, tempPath: tempFilePath, originalPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Extract thumbnails from video
ipcMain.handle('extract-thumbnails', async (event, videoPath, duration) => {
  try {
    const tempDirPath = getTempDir();
    const thumbDir = path.join(tempDirPath, 'thumbnails_' + Date.now());
    
    // Calculate number of thumbnails based on duration (aim for ~50px per thumb)
    const count = Math.max(5, Math.min(20, Math.floor(duration / 2)));
    
    const { extractThumbnails } = require('./ffmpeg/wrapper');
    const thumbnails = await extractThumbnails(videoPath, thumbDir, count, duration);
    
    return { success: true, thumbnails };
  } catch (err) {
    console.error('Thumbnail extraction error:', err);
    return { success: false, error: err.message };
  }
});

app.on('window-all-closed', () => {
  cleanupTempDir();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  cleanupTempDir();
});


