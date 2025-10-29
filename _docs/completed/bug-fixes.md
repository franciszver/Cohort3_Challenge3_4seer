<!-- 091d186a-559d-44cf-8205-ba0561bedbe7 a76c99fe-cb7d-4b39-9810-a3559d89f08c -->
# Fix Timecode Ruler Reactive Updates

## Issues Identified
1. **Thumbnail filling**: Thumbnails don't fill the entire clip width - they use fixed 50px width regardless of clip size
2. **Export resolution options**: No way to select export resolution (720p, 1080p, or source)

## Implementation Plan

### 1. Fix Thumbnail Rendering to Fill Clip Width (`src/renderer/renderer.js`)
- Currently thumbnails are set to fixed 50px width (line 155), which doesn't fill the clip
- Calculate thumbnail width dynamically: `clipWidth / thumbnailCount` 
- Distribute thumbnails evenly across entire clip width
- Ensure each thumbnail fills its allocated space using flex-grow or explicit width calculation
- Update CSS if needed to support dynamic thumbnail sizing

### 2. Add Export Resolution Options (`src/renderer/index.html`, `src/renderer/renderer.js`, `src/main.js`, `src/ffmpeg/wrapper.js`)
- Add resolution selector dropdown/radio buttons in export section (720p, 1080p, Source)
- Default to "Source" to maintain current behavior
- Update `exportConcatenated()` to read selected resolution before calling IPC
- Modify IPC handler `export-video` in `main.js` to accept resolution parameter
- Update `exportConcat()` function signature to accept `resolution` parameter:
  - If "Source": use current copy/encode logic (try copy first, fallback to encode)
  - If "720p" or "1080p": always encode with scale filter `-vf "scale=1280:720"` or `-vf "scale=1920:1080"`
  - Use `-vf` filter with appropriate aspect ratio preservation (e.g., `scale=1280:-2` for maintaining aspect ratio)

## Files to Modify
- `src/renderer/renderer.js`: Fix thumbnail rendering, add resolution selection to export
- `src/renderer/index.html`: Update thumbnail display CSS, and add resolution selector UI
- `src/main.js`: Update IPC handler to accept and pass resolution parameter
- `src/ffmpeg/wrapper.js`: Update `exportConcat()` to handle resolution scaling

### To-dos

- [ ] Update thumbnail rendering in renderTimeline() to distribute thumbnails evenly across entire clip width, making each thumbnail fill its allocated space (clipWidth / thumbnailCount)
- [ ] Add resolution selector dropdown/radio buttons in export section (720p, 1080p, Source) in index.html
- [ ] Update exportConcatenated() in renderer.js to read selected resolution and pass to IPC handler
- [ ] Update export-video IPC handler in main.js to accept resolution parameter
- [ ] Update exportConcat() in wrapper.js to accept resolution and apply scale filter when needed (720p: scale=1280:-2, 1080p: scale=1920:-2, source: no filter)