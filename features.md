# 4Seer Features Documentation

## Introduction

4Seer is a lightweight, fast desktop video editor for Windows that provides essential video editing capabilities without the bloat of full-featured NLEs (Non-Linear Editors). Built with Electron and FFmpeg, 4Seer offers a streamlined workflow from import to export, with advanced features like multi-track editing, live recording, and AI-powered press kit generation.

This document comprehensively catalogs all implemented features, organized by functionality, with detailed descriptions of how each feature works and how users can interact with it.

---

## Video Import & Media Management

### Drag-and-Drop Import
**Description**: Import video files directly by dragging them onto the application window.

**How it works**: 
- Users can drag MP4 or MOV files from Windows Explorer onto the "Project Files" panel (top-left)
- Files are automatically copied to a temporary directory for processing
- Imported files appear in the media library with video icons and filenames

**User interactions**:
- Drag video files from file explorer onto the Project Files panel
- Visual feedback indicates valid drop zone
- Files are immediately available in the media library

**Technical notes**:
- Uses Electron's file system APIs to copy files to temp directory
- Supports MP4 and MOV formats with H.264/AAC codecs
- Files are cleaned up on application exit

### File Picker Import
**Description**: Alternative import method using Windows file picker dialog.

**How it works**:
- Click the dropzone or use file picker button to open Windows file dialog
- Select one or more MP4/MOV files
- Files are imported and added to the media library

**User interactions**:
- Click on the Project Files dropzone area
- Select files from the file picker dialog
- Files appear in the media library after selection

**Technical notes**:
- Uses Electron's `dialog.showOpenDialog` API
- Supports multi-select file selection
- Same processing pipeline as drag-and-drop

### Media Library (Project Files Panel)
**Description**: Centralized media library for managing imported video clips.

**How it works**:
- All imported files are stored in the `importedClips[]` array
- Clips display with video icons (🎬) and filenames
- Clips remain in library even after being added to timeline
- Library serves as the source for timeline clips

**User interactions**:
- View all imported clips in the Project Files panel
- Drag clips from library to timeline tracks
- Import new files at any time to add to library

**Technical notes**:
- Separates imported clips from timeline clips for flexible workflow
- Clips can be added to timeline multiple times from library
- Original file paths preserved for reference

---

## Timeline & Multi-Track Editing

### Multi-Track Timeline
**Description**: Professional timeline with two tracks supporting main video and picture-in-picture overlay.

**How it works**:
- **Track 1 (Main)**: Primary video track displayed at full screen
- **Track 2 (Overlay)**: Secondary track for PIP (Picture-in-Picture) overlay
- Track 2 clips appear above Track 1 in the timeline UI
- Both tracks support independent clip placement and editing

**User interactions**:
- Drag clips from media library to either Track 1 or Track 2
- Visual indicators show which track clips belong to
- Track 2 clips display with distinct styling to differentiate from Track 1

**Technical notes**:
- Clips have a `track` property (1 or 2) stored in clip objects
- Timeline rendering separates clips by track for display
- Export logic composites Track 2 over Track 1 as PIP overlay

### Free Positioning with Smart Snapping
**Description**: Flexible clip positioning with intelligent snapping to playhead, clip edges, and timeline markers.

**How it works**:
- Clips can be positioned anywhere on the timeline (not just sequentially)
- Smart snapping automatically aligns clips to:
  - Playhead position
  - Edges of other clips on the same track
  - Timeline ruler markers (at current zoom interval)
- Hold Shift key to disable snapping for free positioning
- Visual feedback shows when snapping occurs

**User interactions**:
- Drag clips to desired timeline position
- Automatic snapping guides alignment
- Hold Shift while dragging for precise free positioning
- Gaps between clips are allowed and preserved

**Technical notes**:
- Snap threshold: ~5-10 pixels at current zoom level
- Position calculated from mouse coordinates during drag
- `startTime` property stores absolute timeline position for each clip

### Gap Detection and Filling
**Description**: Automatic detection of gaps in timeline with optional black frame filling on export.

**How it works**:
- Before export, the system scans both tracks for empty time segments
- Gap locations and durations are calculated per track
- Export warning dialog appears if gaps are detected
- User can choose to fill gaps with black frames or cancel export

**User interactions**:
- Export button triggers gap detection
- Warning modal displays gap locations and durations
- Confirm to proceed with gap filling, or cancel to adjust timeline

**Technical notes**:
- Gap detection scans timeline for empty segments between clips
- Also detects gaps before first clip and after last clip
- FFmpeg `color` filter used to generate black frames during export
- Gap filling ensures seamless video playback

### Timeline Ruler
**Description**: Time-based ruler showing timeline position in HH:MM:SS.mmm format.

**How it works**:
- Displays time markers at intervals based on current zoom level
- Major markers show full timestamps (HH:MM:SS)
- Minor markers show intermediate positions
- Automatically adjusts marker spacing based on zoom (1s, 2s, or 5s intervals)

**User interactions**:
- Click anywhere on ruler to seek video to that position
- Visual reference for clip positions and durations
- Zoom controls adjust marker density

**Technical notes**:
- Ruler markers dynamically generated based on `timelineZoom` level
- Marker positions calculated to avoid overlap
- Click-to-seek converts pixel coordinates to timeline time

### Playhead
**Description**: Red vertical line indicating current playback position on timeline.

**How it works**:
- Synchronized with video playback in real-time
- Position calculated based on current zoom level
- Auto-scrolls to keep playhead in view during playback
- Visible across entire timeline height (both tracks)

**User interactions**:
- Playhead moves automatically during video playback
- Click timeline to jump playhead to that position
- Drag playhead for scrubbing (seeking video)

**Technical notes**:
- Position calculated as: `currentTime * timelineZoom`
- Auto-scroll updates `timelineScrollWrapper.scrollLeft` during playback
- Playhead element has fixed position with transform-based positioning

---

## Video Preview & Playback

### Composite Preview
**Description**: Real-time preview showing Track 1 and Track 2 composited together with PIP overlay.

**How it works**:
- Canvas-based compositor draws both tracks simultaneously
- Track 1 (main) fills the preview canvas at full size
- Track 2 (overlay) appears as PIP in bottom-right corner (25% width, 10px padding)
- Preview updates in real-time as playhead moves across timeline
- Handles cases where only one track has content

**User interactions**:
- Preview panel shows composite view during playback
- PIP overlay appears when Track 2 clips are active
- Preview updates automatically when clips change tracks

**Technical notes**:
- Uses HTML5 Canvas for compositing (`drawCompositeFrame()`)
- Canvas size matches preview panel dimensions
- `requestAnimationFrame` loop for smooth playback
- Separate video elements for Track 1 and Track 2 clips

### Real-Time Playback
**Description**: Smooth video playback with synchronized timeline and preview.

**How it works**:
- Video element plays the active clip from Track 1
- Composite preview shows Track 2 overlay when active
- Playhead position updates in real-time during playback
- Timeline auto-scrolls to keep playhead visible

**User interactions**:
- Click Play button to start/stop playback
- Video plays from current playhead position
- Preview updates frame-by-frame during playback

**Technical notes**:
- Uses HTML5 video element for Track 1 playback
- Canvas compositing for Track 2 overlay
- `timeupdate` event syncs playhead position
- Handles clip boundaries and track switching

---

## Trimming & Clip Manipulation

### Edge-Dragging Trim
**Description**: Direct manipulation of clip in/out points by dragging clip edges on timeline.

**How it works**:
- Hover near left/right edges of clips (10px threshold)
- Cursor changes to resize indicator (↔) when over edge
- Drag left edge to adjust inPoint (trim start)
- Drag right edge to adjust outPoint (trim end)
- Properties panel updates in real-time during drag
- Minimum clip duration: 0.1 seconds enforced

**User interactions**:
- Hover over clip edge to see resize cursor
- Click and drag edge to trim clip
- Release mouse to apply trim
- Properties panel reflects changes immediately

**Technical notes**:
- Mouse position detection within 10px of clip edge
- Trim calculation: `newInPoint = clip.inPoint + (dragDelta / timelineZoom)`
- Validation ensures minimum 0.1s duration
- Bidirectional binding updates Properties panel

### Properties Panel Trimming
**Description**: Numeric input fields for precise trim point specification.

**How it works**:
- In Point and Out Point input fields show current trim values
- Enter new values and press Enter or click "Apply Trim"
- Changes update clip on timeline immediately
- Bidirectional binding: changes reflect edge-dragging and vice versa

**User interactions**:
- Select clip on timeline
- Type new In Point or Out Point values
- Press Enter or click "Apply Trim" button
- Timeline clip updates to reflect new trim points

**Technical notes**:
- Input validation for numeric values and minimum duration
- Real-time synchronization with timeline clip edges
- Supports decimal seconds (e.g., 1.5 seconds)

### Clip Reordering
**Description**: Drag clips to new positions on timeline to change playback order.

**How it works**:
- Click and drag clip body (not edges) to move clip
- Visual feedback: clip becomes semi-transparent (opacity 0.6) during drag
- Drop at new position to reorder
- Timeline automatically recalculates positions
- Works on both Track 1 and Track 2 independently

**User interactions**:
- Click and hold clip body (middle area)
- Drag to desired position on same track
- Release to drop and reorder
- Visual feedback during drag operation

**Technical notes**:
- Distinguishes between edge drag (trim) and body drag (reorder)
- Mouse position detection: edge = within 10px, body = rest of clip
- Position recalculation updates `startTime` for all affected clips
- Prevents overlap on same track

### Track Assignment
**Description**: Assign clips to Track 1 (main) or Track 2 (overlay) during drag-and-drop.

**How it works**:
- Drag clips from media library to specific track
- Drop zone detection determines which track clip is assigned to
- Clip `track` property set to 1 or 2
- Visual styling differentiates tracks

**User interactions**:
- Drag clip from library to Track 1 or Track 2 area
- Visual feedback shows valid drop zones
- Clip appears on selected track after drop

**Technical notes**:
- Track detection via drop zone bounds checking
- Default track is 1 if not specified
- Track property stored in clip object for export processing

### Per-Clip Mute/Unmute
**Description**: Toggle audio on/off for individual clips.

**How it works**:
- Each clip has a `muted` property (boolean, default false)
- Mute/Unmute button in Properties panel for selected clip
- Muted clips display visual indication on timeline
- Export respects muted state (muted clips have no audio)

**User interactions**:
- Select clip on timeline
- Click Mute/Unmute button in Properties panel
- Visual indicator shows muted state on timeline clip

**Technical notes**:
- Muted property stored in clip object
- Export uses FFmpeg audio filters to exclude muted clips
- Visual styling (opacity or border) indicates muted clips

### Clip Splitting
**Description**: Split a timeline clip into two separate clips at a specific position.

**How it works**:
- Right-click on timeline clip to open context menu
- Select "Split Clip" option
- Clip splits at clicked position into two clips
- Left clip keeps original inPoint, new outPoint at split
- Right clip gets new inPoint at split, original outPoint
- Both clips reference same source file with adjusted trim points

**User interactions**:
- Right-click on timeline clip
- Context menu appears with "Split Clip" option
- Click option to split clip at clicked position
- Two clips appear on timeline

**Technical notes**:
- Split validation: minimum 0.1s duration for each resulting clip
- Cannot split at clip boundaries
- Live recording clips cannot be split
- Right clip triggers new thumbnail extraction
- Timeline positions recalculated after split

---

## Thumbnails & Visualization

### FFmpeg Thumbnail Extraction
**Description**: Automatic generation of filmstrip thumbnails for timeline clips.

**How it works**:
- When clip is added to timeline, thumbnail extraction starts in background
- FFmpeg extracts 5-20 frames evenly distributed across clip duration
- Thumbnails stored in temp directory as JPG files
- Filmstrip view displays thumbnails inside timeline clips

**User interactions**:
- Add clip to timeline
- "Loading..." indicator appears during extraction
- Thumbnails appear after 5-10 seconds (background process)
- Filmstrip view shows visual representation of clip content

**Technical notes**:
- Non-blocking background extraction using IPC
- Thumbnail count based on clip duration (5 for short, up to 20 for long)
- Fixed 80px height for consistent performance
- Thumbnails distributed evenly across clip width
- Cleanup on app exit

### Filmstrip View
**Description**: Visual representation of clip content using thumbnail images inside timeline clips.

**How it works**:
- Thumbnails displayed horizontally inside clip rectangles
- Each thumbnail fills allocated space (clipWidth / thumbnailCount)
- Even distribution across entire clip width
- Loading indicator shown during thumbnail generation

**User interactions**:
- View thumbnails inside timeline clips
- Visual reference for clip content and trim points
- Thumbnails help identify clip segments

**Technical notes**:
- Dynamic thumbnail width calculation
- CSS flexbox for even distribution
- Thumbnails loaded asynchronously as they're generated
- Fallback to colored rectangle if thumbnails unavailable

---

## Zoom & Navigation

### Zoom Controls
**Description**: Adjustable timeline zoom from 10 to 200 pixels per second.

**How it works**:
- Zoom In (+) button increases zoom level by 10px/sec
- Zoom Out (−) button decreases zoom level by 10px/sec
- Default zoom: 50 pixels per second
- Clip widths and time ruler adjust based on zoom level
- Zoom range: 10-200 pixels per second

**User interactions**:
- Click Zoom In (+) to see more detail (wider clips)
- Click Zoom Out (−) to see more timeline (narrower clips)
- Time ruler markers adjust automatically

**Technical notes**:
- `timelineZoom` variable stores current zoom level
- Clip width = `duration * timelineZoom`
- Time ruler marker spacing adjusts based on zoom
- Zoom affects all timeline calculations

### Timeline Auto-Scroll
**Description**: Automatic horizontal scrolling during playback to keep playhead visible.

**How it works**:
- During video playback, timeline scrolls horizontally
- Playhead position kept in viewport
- Smooth scrolling updates as playhead moves
- Zoom-aware scroll behavior

**User interactions**:
- Automatic scrolling during playback
- Playhead always remains visible
- Manual scroll still possible when paused

**Technical notes**:
- Scroll calculation: `scrollLeft = (currentTime * timelineZoom) - (viewportWidth / 2)`
- Updates on `timeupdate` event
- Smooth scrolling with requestAnimationFrame

### Click-to-Seek
**Description**: Click anywhere on timeline to jump video playback to that position.

**How it works**:
- Click coordinates converted to timeline time
- Video seeks to calculated position
- Playhead jumps to clicked location
- Works across both tracks

**User interactions**:
- Click timeline ruler or track area
- Video immediately seeks to clicked position
- Playhead updates to match

**Technical notes**:
- Time calculation: `time = (clickX + scrollLeft) / timelineZoom`
- Uses `video.currentTime` to seek
- Playhead position synchronized

---

## Transport Controls

### Play/Pause
**Description**: Start and stop video playback.

**How it works**:
- Click Play button to start playback from current playhead position
- Click again to pause playback
- Button icon toggles between play (▶) and pause (⏸)
- Playback syncs with timeline playhead

**User interactions**:
- Click Play button to start playback
- Click Pause button to stop playback
- Playhead moves automatically during playback

**Technical notes**:
- Uses HTML5 video `play()` and `pause()` methods
- `timeupdate` event syncs playhead position
- Composite preview updates during playback

### Rewind (-5 seconds)
**Description**: Jump playback backward by 5 seconds.

**How it works**:
- Click Rewind button (⏮) to move playhead back 5 seconds
- Video seeks to new position
- Playhead updates immediately

**User interactions**:
- Click Rewind button
- Video jumps back 5 seconds
- Playback continues from new position if playing

**Technical notes**:
- Calculation: `video.currentTime = Math.max(0, video.currentTime - 5)`
- Playhead position recalculated
- Timeline scrolls if needed

### Forward (+5 seconds)
**Description**: Jump playback forward by 5 seconds.

**How it works**:
- Click Forward button (⏭) to move playhead forward 5 seconds
- Video seeks to new position
- Playhead updates immediately

**User interactions**:
- Click Forward button
- Video jumps forward 5 seconds
- Playback continues from new position if playing

**Technical notes**:
- Calculation: `video.currentTime = Math.min(video.duration, video.currentTime + 5)`
- Playhead position recalculated
- Timeline scrolls if needed

---

## Export & Rendering

### MP4 Export
**Description**: Export timeline clips to MP4 video file with H.264/AAC encoding.

**How it works**:
- Click "Export Video" button
- File save dialog appears
- FFmpeg processes timeline clips in order
- Exports to user-selected location as MP4 file
- Progress bar shows export status

**User interactions**:
- Click "Export Video" button
- Choose save location in file dialog
- Wait for export to complete
- Progress bar shows status updates

**Technical notes**:
- Uses FFmpeg for video encoding
- H.264 video codec, AAC audio codec
- MP4 container format
- Two-pass strategy: try copy first, fallback to encode

### Resolution Options
**Description**: Export video at different resolutions: Source, 720p, or 1080p.

**How it works**:
- Resolution selector in export section
- Options: Source (original), 720p (1280x720), 1080p (1920x1080)
- Default: Source (maintains original resolution)
- Resolution applied during FFmpeg encoding

**User interactions**:
- Select resolution from dropdown before export
- Choose Source to maintain original resolution
- Choose 720p or 1080p for standard resolutions

**Technical notes**:
- FFmpeg scale filter: `-vf "scale=1280:-2"` (720p) or `-vf "scale=1920:-2"` (1080p)
- Aspect ratio maintained with `-2` height
- Source resolution: no scale filter applied

### Multi-Track PIP Export
**Description**: Export Track 1 and Track 2 composited with PIP overlay.

**How it works**:
- Track 1 clips form base video (full screen)
- Track 2 clips overlay as PIP in bottom-right (25% width, 10px padding)
- FFmpeg `filter_complex` with `overlay` filter composites tracks
- Multiple Track 2 clips overlay at different times
- Audio from both tracks mixed together

**User interactions**:
- Add clips to Track 1 and Track 2
- Export combines both tracks automatically
- PIP overlay appears in exported video

**Technical notes**:
- Two-step process: create base video, then overlay Track 2
- Overlay filter: `overlay=W-w-10:H-h-10` (bottom-right positioning)
- Track 2 scaled to 25% width, aspect ratio maintained
- Audio mixing with `amix` filter
- Handles empty track cases (Track 1 only, Track 2 only, or both)

### Gap Filling
**Description**: Automatic filling of timeline gaps with black frames during export.

**How it works**:
- Gap detection scans timeline before export
- Empty time segments identified and measured
- FFmpeg `color` filter generates black frames
- Gaps filled to create seamless video
- Warning dialog shows gap locations before export

**User interactions**:
- Export button triggers gap detection
- Warning modal shows gap information
- Confirm to proceed with gap filling
- Cancel to adjust timeline first

**Technical notes**:
- Gap detection algorithm scans both tracks
- Black frame generation: `color=c=black:size=WxH:duration=gapDuration`
- Concatenated with actual clips using FFmpeg filters
- Ensures continuous video playback

### Export Progress
**Description**: Real-time progress indicator during export operation.

**How it works**:
- Progress bar shows export completion percentage
- Status messages update during export phases
- Color-coded status (normal, success, error)
- Escape key cancels export

**User interactions**:
- Progress bar visible during export
- Status messages show current operation
- Press Escape to cancel export

**Technical notes**:
- IPC communication for progress updates
- FFmpeg progress parsing for accurate percentage
- Cancellation flag stops FFmpeg process
- Progress updates via `export-progress` IPC event

### Export Cancellation
**Description**: Cancel export operation at any time using Escape key.

**How it works**:
- Press Escape key during export
- Cancellation flag set in FFmpeg wrapper
- FFmpeg process terminated
- Partial output file cleaned up

**User interactions**:
- Press Escape key during export
- Export stops immediately
- Status message shows cancellation

**Technical notes**:
- Global cancellation flag: `_exportCancellationFlag`
- FFmpeg process killed on cancellation
- Temp files cleaned up
- IPC handler: `cancel-export`

---

## Live Recording

### Desktop/Window Capture
**Description**: Record desktop screen or specific application window.

**How it works**:
- Recording modal opens with source selection
- Desktop capturer lists available screens and windows
- User selects screen or window to record
- MediaRecorder captures selected source
- Recording saved to temp directory when stopped

**User interactions**:
- Click "Record" button next to transport controls
- Select screen or window from dropdown
- Click "Start Recording"
- Recording appears on timeline in real-time
- Click "Stop Recording" to save

**Technical notes**:
- Uses Electron `desktopCapturer.getSources()` API
- `getUserMedia()` with `chromeMediaSource: 'desktop'`
- MediaRecorder API for recording
- MP4 codec preferred, WebM fallback

### Webcam Recording
**Description**: Record webcam video with PIP overlay on desktop recording.

**How it works**:
- Webcam selection dropdown in recording modal
- Webcam stream captured via `getUserMedia()`
- Canvas compositing overlays webcam on desktop
- Webcam positioned bottom-right (25% width, 10px padding)
- Composite stream recorded to file

**User interactions**:
- Select webcam from dropdown in recording modal
- Toggle webcam on/off
- Webcam appears as PIP overlay during recording
- Recorded video includes webcam overlay

**Technical notes**:
- Canvas-based compositing: `canvas.captureStream(30fps)`
- Webcam overlay: 25% canvas width, aspect ratio maintained
- Position: `canvas.width - webcamWidth - 10, canvas.height - webcamHeight - 10`
- Real-time compositing with `requestAnimationFrame`

### Microphone Audio Capture
**Description**: Record microphone audio along with video.

**How it works**:
- Microphone selection dropdown in recording modal
- Audio stream captured via `getUserMedia()` with audio constraints
- Audio tracks combined with video stream
- MediaRecorder records both video and audio
- Audio level meter shows microphone input levels

**User interactions**:
- Select microphone from dropdown
- Audio level meter shows input levels
- Recording includes microphone audio
- Adjust microphone volume in system settings

**Technical notes**:
- Audio constraints: `{ audio: { deviceId: { exact: microphoneId } } }`
- Audio tracks combined with video: `new MediaStream([...videoTracks, ...audioTracks])`
- Web Audio API `AnalyserNode` for level meter
- Audio mixed during recording, no post-processing needed

### Real-Time Timeline Preview
**Description**: Live recording clip appears on timeline during recording.

**How it works**:
- When recording starts, temporary clip added to timeline
- Clip positioned after last existing clip
- Clip width updates in real-time as recording progresses
- Duration updates every 500ms
- Clip finalized when recording stops

**User interactions**:
- Start recording
- Live clip appears on timeline immediately
- Clip grows in real-time during recording
- Clip becomes permanent when recording stops

**Technical notes**:
- Live clip ID: `'live_recording_' + Date.now()`
- `isLive` flag distinguishes from regular clips
- Duration update: `setInterval(() => updateLiveClipDuration(), 500)`
- Clip width = `(elapsedTime * timelineZoom)`
- Finalization: save file, add to media library, remove `isLive` flag

### Recording Stream Preview
**Description**: Live preview of recording stream in Video Preview panel.

**How it works**:
- Recording stream displayed in preview canvas during capture
- Desktop stream shown at full size
- Webcam overlay appears if enabled
- Real-time preview updates during recording

**User interactions**:
- View recording preview in Video Preview panel
- See exactly what's being recorded
- Monitor webcam overlay position

**Technical notes**:
- Canvas draws recording stream frames
- `requestAnimationFrame` loop for smooth preview
- Same compositing logic as export (webcam overlay)
- Preview stops when recording ends

---

## AI Press Kit Generation

### Automated Video Transcription
**Description**: Transcribe exported video using AWS Transcribe service.

**How it works**:
- After successful export, user prompted to generate press kit
- Video audio extracted using FFmpeg
- Audio uploaded to AWS Transcribe service
- Transcription job started and polled for completion
- Transcript text retrieved and used for press kit generation

**User interactions**:
- Export video successfully
- Click "Yes" when prompted to generate press kit
- Wait for transcription to complete
- Progress indicator shows transcription status

**Technical notes**:
- AWS Transcribe service integration
- Audio extraction: FFmpeg converts video to audio file
- Job polling: checks status every few seconds
- Transcript returned as formatted text with timestamps
- Requires AWS credentials configured in Settings

### Thumbnail Extraction for Press Kit
**Description**: Extract high-quality thumbnail/screenshot from video for press materials.

**How it works**:
- FFmpeg extracts single frame from video
- Frame captured at midpoint or first 10% of video
- Thumbnail saved as image file
- Embedded in generated HTML press kit

**User interactions**:
- Automatic extraction during press kit generation
- Thumbnail included in final press kit HTML

**Technical notes**:
- FFmpeg command: `-ss <timestamp> -i <video> -vframes 1 -q:v 2`
- Thumbnail quality: `-q:v 2` (high quality)
- Base64 encoding or file path for HTML embedding

### AI-Powered Press Kit Creation
**Description**: Generate professional HTML press kit using OpenAI API based on video transcription.

**How it works**:
- Transcription text sent to OpenAI API (GPT-4 or GPT-3.5-turbo)
- AI generates structured press kit content:
  - Product Name
  - Overview paragraph
  - Elevator Pitch
  - Key Features (bullet points)
  - Use Cases
  - Tech Stack
  - Demo Highlights
  - Founder Quote
  - Social Media Content (Twitter/X, Instagram, LinkedIn, TikTok)
  - Press Contact
- HTML formatted with professional styling
- Thumbnail embedded in document

**User interactions**:
- Click "Yes" to generate press kit after export
- Wait for AI generation (30-60 seconds)
- Press kit saved as HTML file next to exported video
- Open HTML file in browser to view

**Technical notes**:
- OpenAI API integration with GPT models
- Structured prompt with transcription and template
- HTML generation with embedded CSS styling
- File saved as `{videoname}_presskit.html`
- Requires OpenAI API key configured in Settings

### Post-Export Prompt
**Description**: Automatic prompt after video export asking if user wants to generate press kit.

**How it works**:
- After successful export, modal popup appears
- Options: "Yes" to generate press kit, "No" to skip
- Only appears if credentials are configured
- If credentials missing, directs user to Settings

**User interactions**:
- Complete video export
- Modal popup appears
- Click "Yes" to generate press kit
- Click "No" to skip

**Technical notes**:
- Modal triggered in `exportConcatenated()` success handler
- Checks credential configuration before showing
- Directs to Settings if credentials missing
- Press kit generation workflow starts on "Yes"

---

## Settings & Configuration

### Secure API Credential Storage
**Description**: Encrypted storage of API credentials using OS-level keychain.

**How it works**:
- Electron `safeStorage` API for encryption
- Windows: Uses Windows Credential Manager (DPAPI)
- macOS: Uses Keychain
- Linux: Uses libsecret
- Credentials encrypted per user account
- Never logged or exposed in console

**User interactions**:
- Credentials stored automatically when saved in Settings
- Encryption status shown in Settings modal
- Warning if encryption unavailable on system

**Technical notes**:
- Config manager module: `src/main/config-manager.js`
- `safeStorage.encryptString()` for storage
- `safeStorage.decryptString()` for retrieval
- JSON storage in `app.getPath('userData')/config.json`
- User-specific encryption keys

### OpenAI API Key Management
**Description**: Secure storage and management of OpenAI API key for press kit generation.

**How it works**:
- Settings modal with password input field for API key
- Show/hide toggle for key visibility
- Key validation (starts with "sk-")
- Encrypted storage using safeStorage
- Masked display in Settings (shows only last 4 characters)

**User interactions**:
- Open Settings modal (gear icon)
- Enter OpenAI API key
- Toggle show/hide to verify key
- Click Save to store encrypted key

**Technical notes**:
- Validation: checks key format (starts with "sk-")
- Encryption before storage
- IPC handlers: `set-openai-key`, `get-openai-key`
- Key retrieved for API calls only when needed

### AWS Credentials Configuration
**Description**: Secure storage of AWS credentials (Access Key ID, Secret Access Key, Region) for transcription.

**How it works**:
- Settings modal with three input fields:
  - Access Key ID (text input)
  - Secret Access Key (password input with show/hide)
  - Region (text input with dropdown suggestions)
- Credentials validated before storage
- Encrypted storage using safeStorage
- Masked display in Settings

**User interactions**:
- Open Settings modal
- Enter AWS Access Key ID
- Enter AWS Secret Access Key
- Select or enter AWS Region
- Click Save to store encrypted credentials

**Technical notes**:
- Validation: region format check
- Separate storage for each credential
- IPC handlers: `set-aws-credentials`, `get-aws-credentials`
- Credentials retrieved for AWS Transcribe calls only
- Region validation: standard AWS region format

### Settings Modal UI
**Description**: User interface for configuring API credentials.

**How it works**:
- Settings button (gear icon) in Preview panel header
- Modal overlay with dark theme styling
- Sections for OpenAI and AWS credentials
- Encryption status indicator
- Save and Cancel buttons
- Form validation with error messages

**User interactions**:
- Click Settings button (gear icon)
- Modal opens with current credential status
- Enter or update credentials
- Click Save to store
- Click Cancel to close without saving

**Technical notes**:
- Modal overlay with z-index above main UI
- Dark theme consistent with application
- Input validation before saving
- Error messages for invalid inputs
- Encryption status check on load

---

## User Functionality Summary

This comprehensive list details all user-accessible features and actions available in 4Seer:

### File Management
- **Import videos** via drag-and-drop onto Project Files panel
- **Import videos** via file picker dialog
- **View media library** in Project Files panel (top-left)
- **Drag clips from library** to timeline tracks

### Timeline Editing
- **Add clips to Track 1** (main video track) by dragging from library
- **Add clips to Track 2** (overlay/PIP track) by dragging from library
- **Position clips freely** on timeline with gaps allowed
- **Smart snap positioning** (automatic alignment to playhead, clip edges, markers)
- **Free positioning** (hold Shift key to disable snapping)
- **View timeline ruler** with time markers in HH:MM:SS.mmm format
- **Click timeline** to seek video to clicked position
- **Drag playhead** for scrubbing/seek preview
- **View playhead** (red vertical line) indicating current playback position
- **Auto-scroll timeline** during playback (keeps playhead visible)

### Clip Manipulation
- **Trim clips** by dragging left edge (adjusts inPoint/start)
- **Trim clips** by dragging right edge (adjusts outPoint/end)
- **Set trim points** via Properties panel numeric inputs
- **Apply trim** from Properties panel (Enter key or Apply button)
- **Reorder clips** by dragging clip body to new position
- **Split clips** via right-click context menu ("Split Clip" option)
- **Assign clips to tracks** (Track 1 or Track 2) during drag
- **Mute/unmute clips** via Properties panel button
- **Delete clips** from timeline (Delete/Backspace key)
- **Select clips** by clicking on timeline

### Preview & Playback
- **Preview video** in Video Preview panel (top-right)
- **View composite preview** (Track 1 + Track 2 PIP overlay)
- **Play/Pause video** via transport controls
- **Rewind 5 seconds** via rewind button
- **Forward 5 seconds** via forward button
- **Seek to timeline position** by clicking timeline
- **View playhead movement** synchronized with playback

### Visualization
- **View filmstrip thumbnails** inside timeline clips
- **See loading indicator** during thumbnail generation
- **Identify clip content** via thumbnail previews

### Zoom & Navigation
- **Zoom in** timeline (+ button) to see more detail
- **Zoom out** timeline (− button) to see more content
- **Adjust zoom range** from 10 to 200 pixels per second
- **View time ruler markers** that adjust with zoom level

### Export
- **Export video** to MP4 format via Export button
- **Choose export resolution** (Source, 720p, 1080p)
- **Select save location** via file dialog
- **View export progress** via progress bar
- **Cancel export** via Escape key
- **Export multi-track** with PIP overlay (Track 2 over Track 1)
- **Fill timeline gaps** with black frames during export
- **View gap warnings** before export if gaps detected

### Live Recording
- **Open recording modal** via Record button
- **Select desktop/window** to record from dropdown
- **Select webcam** for PIP overlay from dropdown
- **Toggle webcam** on/off during recording setup
- **Select microphone** for audio capture from dropdown
- **View audio level meter** for microphone input
- **Start recording** via Start button
- **View live preview** in Video Preview panel during recording
- **See recording clip** appear on timeline in real-time
- **Stop recording** via Stop button
- **Save recording** automatically to media library

### Clip Splitting
- **Right-click timeline clip** to open context menu
- **Split clip** at clicked position via context menu
- **Create two clips** from one clip (left and right segments)

### AI Press Kit Generation
- **Generate press kit** after video export (prompt appears)
- **Transcribe video** automatically using AWS Transcribe
- **Extract thumbnail** from video for press materials
- **Generate HTML press kit** using AI (OpenAI)
- **Save press kit** as HTML file next to exported video
- **View press kit** in web browser

### Settings & Configuration
- **Open Settings modal** via gear icon in Preview panel
- **Configure OpenAI API key** for press kit generation
- **Configure AWS credentials** (Access Key ID, Secret Access Key, Region)
- **View encryption status** in Settings modal
- **Save credentials** securely (encrypted storage)
- **Toggle show/hide** for password fields
- **Cancel settings** without saving

### Keyboard Shortcuts
- **Escape key**: Cancel export operation
- **Enter key**: Apply trim from Properties panel inputs
- **Delete/Backspace**: Delete selected clip from timeline
- **Escape key**: Close context menu (if open)

### Visual Feedback
- **See resize cursor** (↔) when hovering over clip edges
- **See drag cursor** when dragging clips
- **View semi-transparent clips** during drag operations
- **See blue border** on selected clips
- **View loading indicators** during thumbnail generation
- **See progress bars** during export and press kit generation
- **View color-coded status messages** (normal, success, error)
- **See muted clip indicators** on timeline

---

## Technical Architecture Notes

### Core Technologies
- **Electron**: Desktop application framework
- **FFmpeg**: Video processing and encoding
- **HTML5 Canvas**: Video compositing and preview
- **MediaRecorder API**: Live recording
- **AWS SDK**: Transcribe service integration
- **OpenAI API**: AI-powered content generation
- **Electron safeStorage**: Secure credential encryption

### Data Flow
1. **Import**: Files copied to temp directory, added to `importedClips[]`
2. **Timeline**: Clips from library added to `timelineClips[]` with track assignment
3. **Editing**: Trim points, positions, and properties modified in clip objects
4. **Preview**: Canvas compositing draws Track 1 and Track 2 simultaneously
5. **Export**: FFmpeg processes clips with multi-track overlay and gap filling
6. **Recording**: MediaRecorder captures streams, saves to temp, adds to library

### Performance Considerations
- Thumbnail extraction runs in background (non-blocking)
- Fixed thumbnail size (80px height) for consistent performance
- Canvas compositing optimized with requestAnimationFrame
- Zoom rendering may lag with 20+ clips (virtual rendering planned)
- Export uses two-pass strategy (copy first, encode fallback)

---

*This documentation represents all features implemented in 4Seer MVP as of the current version. For implementation details, see `_docs/completed/` folder. For quick reference, see `_docs/completed/QUICK_REFERENCE.md`. For testing procedures, see `_docs/completed/TESTING_GUIDE.md`.*

