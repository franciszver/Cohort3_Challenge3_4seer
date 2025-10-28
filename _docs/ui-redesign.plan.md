<!-- 159bdb9f-486d-4c40-a90d-d8612384fa08 a0e9942f-3c1c-47db-87a9-05b8cd89e603 -->
# OpenShot-Style UI Redesign Plan

## Overview

Redesign the MVP to match OpenShot's interface while preserving existing functionality. Implement 4-panel layout, dark theme, media library workflow, timeline direct manipulation, thumbnail generation, and playhead synchronization.

## Phase 1: Layout Restructure & Dark Theme

**Goal**: Establish 4-panel layout matching OpenShot's structure and apply dark theme

**Changes to `src/renderer/index.html`**:

- Replace current simple layout with 4-panel grid structure:
- Top-left: Project Files panel (media library)
- Top-right: Video Preview panel
- Bottom-left: Properties panel
- Bottom-center/right: Timeline panel
- Apply dark theme CSS (dark backgrounds, white text, colored accents)
- Add panel labels and borders matching OpenShot style

**Testing**: Verify layout renders correctly with all 4 panels visible

## Phase 2: Media Library & Drag-to-Timeline

**Goal**: Separate imported clips from timeline, implement drag-from-library-to-timeline workflow

**Changes to `src/renderer/renderer.js`**:

- Split data model: `importedClips[]` (media library) vs `timelineClips[]` (on timeline)
- Move dropzone into Project Files panel (top-left)
- Render imported clips as list items in Project Files panel
- Implement drag-and-drop from Project Files to timeline Track 1
- Update `addClipFromFile()` to add to `importedClips` only
- Create `addClipToTimeline()` function for drag-to-timeline operation
- Update `renderTimeline()` to only show `timelineClips`

**Changes to `src/renderer/index.html`**:

- Add Project Files panel with scrollable clip list
- Add drag handles to library clips
- Style timeline to show Track 1 label on left side

**Testing**: Import clips to library, drag them to timeline, verify they appear on timeline only after dragging

## Phase 3: Timeline Visual Improvements

**Goal**: Add playhead, time ruler, transport controls, and OpenShot-style clip appearance

**Changes to `src/renderer/renderer.js`**:

- Add playhead rendering (vertical red line) synced to video currentTime
- Implement time ruler with HH:MM:SS.mmm format markers
- Create transport controls (play, pause, rewind, forward buttons)
- Style timeline clips as colored rectangles with labels
- Add `updatePlayhead()` function called on video timeupdate event
- Implement timeline click-to-seek functionality

**Changes to `src/renderer/index.html`**:

- Add time ruler above timeline tracks
- Add playhead element (positioned absolutely)
- Add transport controls below video preview
- Update timeline clip styling (colored backgrounds, borders)

**Testing**: Play video and verify playhead moves in sync, click timeline to seek, use transport controls

## Phase 4: Thumbnail Generation

**Goal**: Extract multiple thumbnails per clip for filmstrip view inside timeline clips

**Changes to `src/ffmpeg/wrapper.js`**:

- Add `extractThumbnails(clipPath, outputDir, count)` function
- Use FFmpeg to extract frames at intervals: `ffmpeg -i input -vf fps=1/N -vframes count output_%03d.jpg`
- Return array of thumbnail file paths

**Changes to `src/main.js`**:

- Add IPC handler `extract-thumbnails` that calls FFmpeg wrapper
- Store thumbnails in temp directory per clip

**Changes to `src/renderer/renderer.js`**:

- After clip added to timeline, trigger background thumbnail extraction
- Store thumbnail paths in clip object: `clip.thumbnails = []`
- Update `renderTimeline()` to display thumbnails as background images in clip elements
- Use fixed thumbnail width (50px), scale based on best performance
- Show loading indicator while thumbnails generate

**Testing**: Add clip to timeline, verify thumbnails appear after brief delay, check filmstrip fills clip width

## Phase 5: Direct Timeline Manipulation

**Goal**: Enable drag-to-reorder clips and resize clip edges to trim

**Changes to `src/renderer/renderer.js`**:

- Implement clip drag-to-reorder on timeline:
- Add mousedown/mousemove/mouseup handlers to timeline clips
- Calculate drop position and reorder `timelineClips` array
- Re-render timeline on drop
- Implement edge-dragging to trim:
- Detect mouse near clip left/right edges (within 10px)
- Change cursor to resize indicator
- On drag left edge: update `clip.inPoint`
- On drag right edge: update `clip.outPoint`
- Update Properties panel inputs in real-time (bidirectional binding)
- Constrain minimum clip duration to 0.1 seconds
- Update clip width calculation based on duration and zoom level

**Changes to `src/renderer/index.html`**:

- Update Properties panel to show In/Out point inputs for selected clip
- Bind inputs bidirectionally with timeline clip edges

**Testing**: Drag clip edges to trim, verify Properties panel updates; change Properties inputs, verify clip edges update; drag clips to reorder

## Phase 6: Timeline Zoom Controls

**Goal**: Add zoom slider to change timeline scale (pixels per second)

**Changes to `src/renderer/renderer.js`**:

- Add `timelineZoom` state variable (default: 50 pixels per second)
- Create zoom controls (+ / - buttons or slider)
- Update clip width calculation: `width = duration * timelineZoom`
- Update time ruler markers based on zoom level
- Maintain scroll position relative to playhead when zooming

**Changes to `src/renderer/index.html`**:

- Add zoom controls near timeline (bottom toolbar area)

**Testing**: Use zoom controls, verify timeline clips scale appropriately, ruler updates, scroll position maintained

## Phase 7: Export Integration

**Goal**: Ensure export works with new data model (only timeline clips, respects edge-trim)

**Changes to `src/renderer/renderer.js`**:

- Update `exportConcatenated()` to use `timelineClips` instead of `clips`
- Ensure trim points from edge-dragging are passed to FFmpeg
- Verify clip order matches timeline order

**Testing**: Add multiple clips to timeline, trim via edge-dragging, reorder, export, verify output matches timeline

## Key Files Modified

- `src/renderer/index.html` - Complete layout restructure, new panels
- `src/renderer/renderer.js` - All interaction logic, data model changes
- `src/ffmpeg/wrapper.js` - Thumbnail extraction function
- `src/main.js` - IPC handler for thumbnail extraction

## Testing Strategy Per Phase

Each phase is independently testable:

1. Visual layout check
2. Import and drag workflow
3. Playback and navigation
4. Thumbnail appearance
5. Clip manipulation
6. Zoom functionality
7. End-to-end export

## Acceptance Criteria

- 4-panel layout matches OpenShot structure
- Dark theme applied throughout
- Clips can be imported to library, then dragged to timeline
- Timeline shows filmstrip thumbnails inside clips
- Playhead syncs with video playback
- Timeline click seeks video
- Transport controls work (play/pause/rewind/forward)
- Clips can be reordered by dragging on timeline
- Clip edges can be dragged to trim (updates Properties panel)
- Properties panel inputs update clip edges bidirectionally
- Zoom controls scale timeline appropriately
- Export uses only timeline clips with correct trim points

### To-dos

- [ ] Phase 1: Restructure layout to 4-panel design and apply dark theme
- [ ] Phase 2: Implement media library and drag-to-timeline workflow
- [ ] Phase 3: Add playhead, time ruler, transport controls, and clip styling
- [ ] Phase 4: Implement FFmpeg thumbnail extraction and filmstrip display
- [ ] Phase 5: Enable drag-to-reorder and edge-dragging trim on timeline
- [ ] Phase 6: Add timeline zoom controls
- [ ] Phase 7: Update export to work with new timeline data model