<!-- 6f74787c-43fd-436d-9aa3-8b29dec9c69b 0fc9db84-539f-4283-be63-6b3c73f4cf85 -->
# Live Recording Feature Implementation Plan

## Overview

Add live recording feature that allows users to record webcam, desktop/window, and microphone audio. During recording, a live clip appears on the timeline after existing clips. When recording completes, the clip is saved and appears in the Project Files library.

## Architecture Approach

### Recording Flow

1. User clicks "Record" button next to play controls
2. Recording modal opens with source selection (Desktop/Window, Webcam, Microphone)
3. User configures sources and starts recording
4. Live preview shows in Video Preview panel (top-right)
5. Recording clip appears on timeline in real-time (after last clip)
6. User stops recording → file saves to temp directory → appears in Project Files library

### Technical Stack

- **Desktop/Window Capture:** Electron `desktopCapturer` API → `getUserMedia()`
- **Webcam:** `navigator.mediaDevices.getUserMedia()` with video constraints
- **Microphone:** `navigator.mediaDevices.getUserMedia()` with audio constraints
- **Recording:** MediaRecorder API with MP4 output (video/mp4 codec)
- **Compositing:** HTML5 Canvas to combine webcam + desktop with fixed overlay position
- **Storage:** Save to temp directory, add to `importedClips[]` when complete

## Files to Modify

### 1. `src/renderer/index.html`

**Changes:**

- Add "Record" button next to play/pause in transport controls
- Add recording modal overlay with:
  - Source selection dropdowns (Screen/Window, Webcam, Microphone)
  - Audio level meter for microphone
  - Recording timer display
  - Start/Stop recording buttons
  - Close/Cancel button
- Add CSS for modal, recording indicator, and audio meter

### 2. `src/renderer/renderer.js`

**Changes:**

- Add recording state management:
  ```javascript
  let recordingState = {
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    startTime: null,
    liveClipId: null,
    streams: { desktop: null, webcam: null, audio: null },
    canvas: null,
    canvasStream: null
  };
  ```

- Add functions:
  - `openRecordingModal()` - Show modal, populate source lists
  - `getDesktopSources()` - Use IPC to get screen/window list from main process
  - `startRecording()` - Initialize streams, setup canvas compositing, start MediaRecorder
  - `stopRecording()` - Stop recorder, save file, add to library, cleanup
  - `updateRecordingTimer()` - Update timer display during recording
  - `updateAudioMeter()` - Visualize microphone levels
  - `compositeStreams()` - Canvas-based webcam overlay on desktop (bottom-right, 25% width)
  - `addLiveClipToTimeline()` - Add temporary clip during recording
  - `updateLiveClipDuration()` - Update clip width as recording progresses
  - `finalizeLiveClip()` - Convert to permanent clip, add to library

### 3. `src/main.js`

**Changes:**

- Add IPC handler: `get-desktop-sources`
  - Use `desktopCapturer.getSources()` to list screens and windows
  - Return array of sources with id, name, thumbnail
- Add IPC handler: `save-recording`
  - Accept blob data from renderer
  - Save to temp directory with timestamp filename
  - Return file path for adding to library

### 4. `src/ffmpeg/wrapper.js` (Optional)

**Changes:**

- May need to add MP4 conversion if MediaRecorder doesn't produce compatible MP4
- Add function `convertToMP4(webmPath, mp4Path)` as fallback

## Implementation Details

### Recording Modal UI

```
┌─────────────────────────────────────────┐
│  Record Video                      [X]  │
├─────────────────────────────────────────┤
│  Screen/Window: [Dropdown ▼]           │
│  Webcam:        [Dropdown ▼] [None]    │
│  Microphone:    [Dropdown ▼]           │
│                                         │
│  Audio Level: [████████░░░░░░░░]       │
│                                         │
│  [●  Start Recording]                  │
│                                         │
│  Recording: 00:00:00                   │
│  [■  Stop Recording]                   │
└─────────────────────────────────────────┘
```

### Canvas Compositing (Desktop + Webcam)

- Canvas size matches desktop stream resolution
- Desktop stream drawn at full canvas size
- Webcam stream drawn in bottom-right corner:
  - Width: 25% of canvas width
  - Height: Maintains webcam aspect ratio
  - Position: 10px padding from bottom-right edges
- Canvas updates at 30fps using `requestAnimationFrame()`

### MediaRecorder Configuration

```javascript
const options = {
  mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // H.264 + AAC
  videoBitsPerSecond: 5000000 // 5 Mbps
};
```

Fallback to WebM if MP4 not supported, then convert with FFmpeg.

### Live Timeline Clip

- Create temporary clip with `id: 'live_recording_' + timestamp`
- Initial duration: 0.1s, positioned after last clip
- Update duration every 500ms during recording
- On stop: save file, replace with permanent clip, add to library

### Audio Level Meter

- Use Web Audio API `AnalyserNode` on microphone stream
- Update meter bar width based on volume level
- Range: -60dB to 0dB (green to red gradient)

## Key Challenges & Solutions

**Challenge 1:** Combining multiple streams (desktop + webcam + mic)

- **Solution:** Use Canvas to composite video streams, add audio track separately

**Challenge 2:** MP4 recording browser support

- **Solution:** Try MP4 first, fallback to WebM → FFmpeg conversion

**Challenge 3:** Live timeline updates during recording

- **Solution:** Use `setInterval()` to update clip width every 500ms based on elapsed time

**Challenge 4:** Electron desktopCapturer in renderer process

- **Solution:** Call from main process via IPC, return source list to renderer

## Testing Checklist

- [ ] Desktop screen capture works
- [ ] Window capture lists all windows
- [ ] Webcam selection and preview works
- [ ] Microphone selection and audio meter works
- [ ] Recording with desktop only
- [ ] Recording with desktop + webcam (overlay positioned correctly)
- [ ] Recording with desktop + webcam + mic
- [ ] Live clip appears on timeline during recording
- [ ] Live clip duration updates in real-time
- [ ] Stop recording saves file correctly
- [ ] Saved clip appears in Project Files library
- [ ] Recorded clip can be dragged to timeline (again)
- [ ] Recorded clip can be trimmed and exported
- [ ] Video preview shows recording stream during capture
- [ ] Audio levels display correctly
- [ ] Modal can be canceled without starting recording
- [ ] Multiple recordings create separate files

## Future Enhancements (Not in this MVP)

- Adjustable webcam overlay position/size
- Multiple audio sources (desktop audio + mic)
- Recording countdown timer (3-2-1)
- Pause/resume recording
- Hotkey to start/stop recording
- Custom recording presets (resolution, bitrate)

### To-dos

- [ ] Add Record button next to transport controls in index.html
- [ ] Create recording modal HTML structure with source selectors, audio meter, timer, and control buttons
- [ ] Add CSS styling for modal overlay, recording controls, audio meter, and recording indicator
- [ ] Add IPC handler in main.js to get desktop sources using desktopCapturer API
- [ ] Add IPC handler in main.js to save recording blob to temp directory
- [ ] Add recording state management object in renderer.js
- [ ] Implement openRecordingModal() and closeRecordingModal() functions with source population
- [ ] Implement getDesktopSources() to populate screen/window dropdowns via IPC
- [ ] Implement getUserMedia calls for desktop, webcam, and microphone streams
- [ ] Implement canvas-based stream compositing with webcam overlay (bottom-right, 25% width)
- [ ] Implement audio level meter using Web Audio API AnalyserNode
- [ ] Setup MediaRecorder with MP4 codec configuration and data chunk handling
- [ ] Implement startRecording() function to initialize all streams, canvas, and MediaRecorder
- [ ] Implement addLiveClipToTimeline() and updateLiveClipDuration() for real-time timeline updates
- [ ] Implement recording timer display that updates every second
- [ ] Implement stopRecording() to finalize recording, save file via IPC, and cleanup streams
- [ ] Implement finalizeLiveClip() to convert live clip to permanent clip and add to Project Files library
- [ ] Connect recording stream to Video Preview panel during recording
- [ ] Add error handling for permission denials, unsupported codecs, and stream failures
- [ ] Test all recording scenarios: desktop only, desktop+webcam, desktop+webcam+mic, window capture