const { app, BrowserWindow, dialog, shell, ipcMain, desktopCapturer } = require('electron');
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
ipcMain.handle('export-video', async (event, clips, resolution = 'source') => {
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
    await exportConcat(clips, result.filePath, resolution, (p) => {
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
    
    // Limit to exactly 5 thumbnails per clip that will stretch across the entire clip width
    const count = 5;
    
    const { extractThumbnails } = require('./ffmpeg/wrapper');
    const thumbnails = await extractThumbnails(videoPath, thumbDir, count, duration);
    
    return { success: true, thumbnails };
  } catch (err) {
    console.error('Thumbnail extraction error:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Get desktop sources for screen/window capture
ipcMain.handle('get-desktop-sources', async (event) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    return { success: true, sources: sources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.toDataURL()
    })) };
  } catch (err) {
    console.error('Desktop sources error:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Save recording blob to temp directory
ipcMain.handle('save-recording', async (event, blobData) => {
  try {
    const tempDirPath = getTempDir();
    const timestamp = Date.now();
    const fileName = `recording_${timestamp}.mp4`;
    const filePath = path.join(tempDirPath, fileName);
    
    // Convert blob data to buffer and save
    const buffer = Buffer.from(blobData);
    fs.writeFileSync(filePath, buffer);
    
    return { success: true, path: filePath, fileName };
  } catch (err) {
    console.error('Save recording error:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Credential management handlers
const configManager = require('./main/config-manager');

// Check if encryption is available
ipcMain.handle('check-encryption-available', async () => {
  return configManager.isEncryptionAvailable();
});

// Get masked config for display
ipcMain.handle('get-api-config', async () => {
  return configManager.getMaskedConfig();
});

// Set OpenAI API key
ipcMain.handle('set-openai-key', async (event, key) => {
  try {
    configManager.setOpenAIKey(key);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Set AWS credentials
ipcMain.handle('set-aws-credentials', async (event, accessKeyId, secretAccessKey, region) => {
  try {
    configManager.setAWSCredentials(accessKeyId, secretAccessKey, region);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get OpenAI key (for API calls)
ipcMain.handle('get-openai-key', async () => {
  const key = configManager.getOpenAIKey();
  return key ? { success: true, key } : { success: false, error: 'No API key configured' };
});

// Get AWS credentials (for API calls)
ipcMain.handle('get-aws-credentials', async () => {
  const creds = configManager.getAWSCredentials();
  return creds ? { success: true, ...creds } : { success: false, error: 'No AWS credentials configured' };
});

// Check if credentials are configured
ipcMain.handle('check-credentials-configured', async () => {
  return configManager.hasConfiguredCredentials();
});

// IPC: Transcribe video
ipcMain.handle('transcribe-video', async (event, videoPath) => {
  try {
    const creds = configManager.getAWSCredentials();
    if (!creds) {
      return { success: false, error: 'AWS credentials not configured' };
    }
    
    const { transcribeVideo } = require('./main/transcribe-service');
    const transcript = await transcribeVideo(videoPath, creds);
    
    return { success: true, transcript };
  } catch (err) {
    console.error('Transcription error:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Extract press kit thumbnail
ipcMain.handle('extract-presskit-thumbnail', async (event, videoPath) => {
  try {
    const { extractPressKitThumbnail } = require('./ffmpeg/wrapper');
    const thumbnailPath = await extractPressKitThumbnail(videoPath);
    return { success: true, path: thumbnailPath };
  } catch (err) {
    console.error('Thumbnail extraction error:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Generate press kit
ipcMain.handle('generate-presskit', async (event, transcription, thumbnailPath) => {
  try {
    const key = configManager.getOpenAIKey();
    if (!key) {
      return { success: false, error: 'OpenAI API key not configured' };
    }
    
    const { generatePressKit } = require('./main/presskit-generator');
    const htmlContent = await generatePressKit(transcription, thumbnailPath, key);
    
    return { success: true, htmlContent };
  } catch (err) {
    console.error('Press kit generation error:', err);
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


