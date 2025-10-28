# 4Seer - MVP Video Editor

A lightweight, fast desktop video editor for Windows that validates the core workflow: **Import → Preview → Trim → Export**. Built with Electron and FFmpeg, designed as a ClipChamp clone for quick video editing tasks.

## Overview

4Seer MVP is an installable Windows application that provides essential video editing capabilities without the bloat of full-featured NLEs (Non-Linear Editors). It's optimized for content creators who need a fast, lightweight tool for trimming clips and concatenating videos.

## Features

### ✅ Implemented Features

- **Video Import**
  - Drag-and-drop MP4/MOV file import
  - File picker dialog for alternative import
  - Media library panel for imported clips

- **Timeline & Preview**
  - Single-track timeline with clip positioning
  - Real-time video preview with playback controls
  - Playhead with auto-scroll to keep content in view
  - Time ruler with HH:MM:SS.mmm format

- **Trimming**
  - Set in/out points via numeric inputs in Properties panel
  - Direct manipulation: drag clip edges to trim
  - Bidirectional binding between timeline and Properties panel
  - Minimum clip duration: 0.1 seconds

- **Clip Manipulation**
  - Drag clips to reorder on timeline
  - Automatic sequential positioning (no gaps)
  - Click timeline to seek to position
  - Drag playhead for scrubbing

- **Thumbnails & Visualization**
  - FFmpeg-powered thumbnail extraction
  - Filmstrip view inside timeline clips (5-20 thumbnails per clip)
  - Background extraction (non-blocking)
  - Loading indicator during generation

- **Zoom & Navigation**
  - Zoom In/Out controls (10-200 pixels per second)
  - Timeline auto-scroll during playback
  - Zoom-aware scroll behavior
  - Click timeline to seek

- **Transport Controls**
  - Play/Pause button
  - Rewind (-5 seconds)
  - Forward (+5 seconds)
  - Playhead sync with video playback

- **Export**
  - Export trimmed clips to MP4
  - Automatic clip concatenation
  - H.264/AAC encoding
  - Progress bar with status updates
  - Cancellation support (Escape key)
  - Two-pass export strategy (copy → encode fallback)

### 🚫 Known Limitations

- **Single-track only** - No multi-track editing support
- **No transitions** - Clips play sequentially without effects
- **No effects** - No video filters or effects processing
- **No audio waveforms** - Audio tracks visible only via export
- **Windows-only** - Cross-platform support planned for future versions
- **Fixed thumbnail quality** - Low-res thumbnails for performance
- **No undo/redo** - Changes are immediate and permanent

## Installation

### User Installation (Packaged Installer)

1. Download `4Seer Setup 1.0.0.exe` from releases
2. Run the installer and follow the setup wizard
3. Launch 4Seer from Start Menu or Desktop shortcut
4. No external dependencies needed (FFmpeg bundled)

### Developer Setup

**Requirements:**
- Node.js 14+ and npm
- FFmpeg binary (pre-bundled in `resources/ffmpeg/`)
- Windows 10/11 64-bit

**Steps:**

1. Clone the repository:
```bash
git clone <repository-url>
cd 4seer
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm start
```

4. Build the installer:
```bash
npm run build
```

The installer will be created in `dist/` directory as `4Seer Setup 1.0.0.exe`

## Creating the Installer

### Prerequisites
- All code changes committed and tested
- No uncommitted files in working directory
- Sufficient disk space (2GB+ recommended)

### Build Steps

1. **Verify FFmpeg is bundled:**
   ```bash
   # Check FFmpeg exists
   dir resources\ffmpeg\ffmpeg.exe
   ```

2. **Build the installer:**
   ```bash
   npm run build
   ```

   This will:
   - Compile Electron app
   - Bundle FFmpeg via `extraResources`
   - Create NSIS installer
   - Generate portable zip
   - Output to `dist/` directory

3. **Build artifacts:**
   - `4Seer Setup 1.0.0.exe` - Installer (runs setup wizard)
   - `4Seer Setup 1.0.0.exe.blockmap` - Delta updates
   - `latest.yml` - Update metadata
   - `win-unpacked/` - Unpacked portable version

4. **Test the installer:**
   ```bash
   # Run installer on clean machine or VM
   dist/4Seer\ Setup\ 1.0.0.exe
   
   # Verify:
   # 1. Installation wizard appears
   # 2. App installs to Program Files
   # 3. Desktop/Start Menu shortcuts created
   # 4. App launches and plays video
   # 5. FFmpeg works (can import/export)
   ```

5. **Distribute:**
   - Copy `4Seer Setup 1.0.0.exe` to distribution location
   - Update version in `package.json` for next build
   - Tag release in git: `git tag v1.0.0`

### Build Configuration

Located in `package.json`:

```json
{
  "build": {
    "appId": "com.4seer.mvpvideoeditor",
    "productName": "4Seer",
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "extraResources": [
      {
        "from": "resources/ffmpeg",
        "to": "ffmpeg",
        "filter": ["**/*"]
      }
    ],
    "files": [
      "src/**/*",
      "package.json"
    ]
  }
}
```

## Project Structure

```
4seer/
├── src/
│   ├── main.js              # Electron main process, IPC handlers
│   ├── renderer/
│   │   ├── index.html       # UI layout (4-panel design)
│   │   └── renderer.js      # All UI logic and interactions
│   └── ffmpeg/
│       └── wrapper.js       # FFmpeg command composition
├── resources/
│   └── ffmpeg/              # FFmpeg binaries (bundled in installer)
│       ├── ffmpeg.exe
│       ├── ffplay.exe
│       └── ffprobe.exe
├── dist/                    # Build output (installer)
├── _docs/
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── TESTING_GUIDE.md
│   ├── QUICK_REFERENCE.md
│   └── plan.plan.md
├── package.json
└── README.md
```

## Architecture

### Main Process (`src/main.js`)

- **Window Management**: Creates and manages the Electron window
- **IPC Handlers**:
  - `import-file`: Copies selected files to temporary directory
  - `extract-thumbnails`: Calls FFmpeg to generate clip thumbnails
  - `export-video`: Orchestrates video export with FFmpeg
- **Temp File Management**: Cleanup on app exit
- **FFmpeg Path Resolution**: Handles both dev and packaged modes

### Renderer Process (`src/renderer/renderer.js`)

- **Data Model**:
  - `importedClips[]`: Media library (files imported but not on timeline)
  - `timelineClips[]`: Clips on the timeline ready for playback/export
  - `timelineCurrentTime`: Global playhead position (seconds)
  - `timelineZoom`: Current zoom level (pixels/second)

- **Core Functions**:
  - `renderProjectFiles()`: Displays imported clips in media library
  - `renderTimeline()`: Renders timeline with clips and thumbnails
  - `addClipFromFile()`: Imports file to library
  - `addClipToTimeline()`: Adds library clip to timeline
  - `selectTimelineClip()`: Loads clip for preview/editing
  - `seekToTimelinePosition()`: Seeks to timeline position (handles playhead dragging)
  - `handleDrag()` / `finishDrag()`: Clip reordering logic
  - `handleResize()` / `finishResize()`: Edge-dragging trim logic
  - `extractThumbnailsForClip()`: Background thumbnail generation

- **Event Listeners**:
  - Drag-and-drop import
  - Timeline clip selection, reordering, trimming
  - Playhead dragging and timeline clicking
  - Transport controls (Play/Pause, Rewind, Forward)
  - Zoom controls with zoom-aware auto-scroll
  - Auto-play next clip when current finishes

### UI Layout (4-Panel Design)

```
┌─────────────────────────────────────────────────┐
│  PROJECT FILES              VIDEO PREVIEW       │
│  (Media Library)            [Video Player]      │
│  - Imported clips           [Transport Controls]│
│  - Drag to timeline         [Playhead Sync]     │
├─────────────────────────────────────────────────┤
│  PROPERTIES                 TIMELINE            │
│  - In Point input           [Time Ruler]        │
│  - Out Point input          [Track 1]           │
│  - Apply Trim button        [Clips + Thumbs]    │
│  - Export Video button      [Auto-scroll]       │
│  - Export progress          [Zoom Controls]     │
└─────────────────────────────────────────────────┘
```

### FFmpeg Integration (`src/ffmpeg/wrapper.js`)

**Export Workflow:**
1. **Copy Pass**: Attempt to copy video streams without re-encoding
2. **Encode Fallback**: If copy fails, re-encode with H.264/AAC
3. **Concatenation**: Use FFmpeg concat demuxer to join segments
4. **Output**: Single MP4 file with default presets

**Thumbnail Extraction:**
- Extracts frames at regular intervals: `duration / (count + 1)`
- Scales thumbnails to 80px height for performance
- Counts: 5-20 per clip based on duration

**FFmpeg Commands:**
```bash
# Copy mode (fast)
ffmpeg -ss <in> -to <out> -i <input> -c copy <output>

# Encode mode (compatible)
ffmpeg -ss <in> -to <out> -i <input> -c:v libx264 -c:a aac -preset veryfast <output>

# Thumbnails
ffmpeg -ss <time> -i <input> -vframes 1 -q:v 2 -vf scale=80:-1 <output>

# Concatenation
ffmpeg -f concat -safe 0 -i segments.txt -c copy <output>
```

## FFmpeg Bundling Approach

### Development Mode
- FFmpeg binaries located at: `resources/ffmpeg/ffmpeg.exe`
- Resolved via: `path.join(__dirname, '..', '..', 'resources', 'ffmpeg', 'ffmpeg.exe')`

### Packaged Mode (Installer)
- FFmpeg included in installer via `electron-builder` `extraResources`
- Resolved via: `path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')`
- Installer includes: `ffmpeg.exe`, `ffplay.exe`, `ffprobe.exe`

### Build Configuration (`package.json`)
```json
{
  "extraResources": [
    {
      "from": "resources/ffmpeg",
      "to": "ffmpeg",
      "filter": ["**/*"]
    }
  ]
}
```

**Key Benefits:**
- No external dependencies for end users
- Works offline after installation
- Consistent FFmpeg version across installations
- Easy version upgrades (replace binaries in resources/)

## Performance Considerations

### Thumbnail Generation
- **Non-blocking**: Runs in background after clip added to timeline
- **Lazy loading**: Thumbnails populate after clip loads
- **Optimal count**: 5-20 per clip (calculated from duration)
- **Scale**: 80px height maintains quality while reducing memory
- **Format**: JPEG at quality 2 (high quality, small file)
- **Time to extract**: 5-30 seconds depending on clip count/duration

### Timeline Rendering
- **Clips are redrawn on**: zoom change, trim change, reorder, playhead update
- **Performance impact**: May lag with 15+ clips at high zoom
- **Optimization**: Consider clip virtualization for large projects

### Memory Usage
- **Video elements**: One shared video element for all clips
- **Temp files**: Cleaned up on app exit (thumbnails, segments, imports)
- **Zoom level**: Each zoom change recalculates all clip positions
- **Typical usage**: 50-200MB depending on project size

### Optimization Tips
- Zoom out to see full timeline without scrolling
- Use low zoom when working with many clips (10+)
- Trim clips in the library before adding to timeline
- Close and reopen app between large projects to clear temp files
- Disable thumbnail preview for projects with 20+ clips (if implemented)

## Troubleshooting

### Video Won't Play
- **Symptom**: Click play, nothing happens
- **Solution**: 
  1. Make sure a clip is selected (blue border on timeline)
  2. Check that video file is MP4 or MOV format
  3. Verify file is not corrupted by opening in system player

### Playhead Stuck or Jerky
- **Symptom**: Playhead doesn't move smoothly or gets stuck
- **Solution**:
  1. Check CPU usage (may be high during thumbnail extraction)
  2. Pause and resume playback
  3. Zoom out to reduce rendering load
  4. Close other applications

### Thumbnails Not Appearing
- **Symptom**: Clips show "Loading..." indefinitely
- **Solution**:
  1. Wait longer (thumbnail extraction can take 10-30 seconds)
  2. Check that clip duration was detected (Properties panel should show duration)
  3. Verify video file is not corrupted
  4. Check console (F12) for FFmpeg errors

### Export Fails or Produces Invalid File
- **Symptom**: Export completes but video won't play
- **Solution**:
  1. Try exporting with fewer/shorter clips
  2. Ensure all clips are in MP4 or MOV format
  3. Check that trim points are valid (Out Point > In Point)
  4. Verify disk space is available
  5. Press Escape to cancel and try again

### FFmpeg Not Found
- **Symptom**: "FFmpeg exited with code..." error during export
- **Solution**:
  1. Development mode: Verify `resources/ffmpeg/ffmpeg.exe` exists
  2. Packaged mode: Reinstall the application
  3. Check Windows Defender hasn't quarantined FFmpeg

### Performance Issues
- **Symptom**: App feels slow, lag when playing or editing
- **Solution**:
  1. Zoom out to reduce timeline rendering
  2. Close Project Files panel if not needed
  3. Export and close current project before starting new one
  4. Check for FFmpeg processes in Task Manager (may indicate ongoing thumbnail extraction)

### Clips Won't Import
- **Symptom**: Drag-and-drop doesn't add clips
- **Solution**:
  1. Ensure files are MP4 or MOV format
  2. Try using file picker (click dropzone) instead of drag-and-drop
  3. Check file path doesn't contain special characters
  4. Verify file size is not extremely large (>4GB)

## Development Scripts

```bash
# Start app in development mode
npm start

# Build installer (output to dist/)
npm run build
```

## Contributing

### Development Workflow

1. **Set up environment**: `npm install`
2. **Run dev server**: `npm start`
3. **Test changes**: Manual testing of feature
4. **Commit changes**: Only well-tested code
5. **Build installer**: `npm run build` (if releasing)

### Code Guidelines

- Use strict mode: `"use strict";` at top of files
- Variable naming: `camelCase` for variables/functions
- Comments: Explain "why" not "what"; code should be self-documenting
- Functions: Keep under 50 lines; extract complex logic
- No console.log in production code (use debugging with F12)

### Testing Checklist

- [ ] Import clips (drag-drop and file picker)
- [ ] Preview video (play, pause, rewind, forward)
- [ ] Trim clip (edge-dragging and numeric inputs)
- [ ] Reorder clips (drag clip body)
- [ ] Use zoom controls (in and out)
- [ ] Export video (verify output plays)
- [ ] Test at multiple zoom levels
- [ ] Test with 3+ clips on timeline

## License

This project is part of GauntletAI Cohort3 Challenge 3.

## Support

For issues, questions, or feature requests:
1. Check QUICK_REFERENCE.md for common workflows
2. Review TESTING_GUIDE.md for expected behavior
3. Check console (F12) for error messages
4. See Troubleshooting section above

## Version History

### v1.0.0 (Current)
- Initial MVP release
- 4-panel OpenShot-style interface
- Media library workflow
- Direct timeline manipulation (trim, reorder)
- Thumbnail generation
- Playhead sync and auto-scroll
- Export with two-pass strategy

---

**4Seer Team**
GauntletAI Cohort3 Challenge 3 - 2025
