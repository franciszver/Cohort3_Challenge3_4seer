<!-- e13778fb-5909-456b-9151-9e065324650f 9119a3e3-8c24-494f-81b9-1f74d52df42b -->
# Multi-Track Timeline with PIP Overlay Implementation

## Overview

Add multi-track support with Track 1 (main video) and Track 2 (overlay/PIP). Track 2 overlays Track 1 as a smaller picture-in-picture video in the bottom-right corner (25% width, maintain aspect ratio, 10px padding).

## Key Requirements

- Track 2 (overlay) displayed above Track 1 (main) in timeline UI
- Clips can be dragged to specific tracks
- Free positioning with gaps allowed
- No overlap on same track (prevent or push)
- Smart snapping (default), Shift key for free positioning
- Gap detection with warning dialog on export (Option B: fill gaps with black, with confirmation)
- Real-time composite preview (Track 1 + Track 2 overlay)
- Export fills gaps with black frames
- Multiple clips on Track 2 allowed (each overlays independently)
- Audio: Mix both tracks' audio, with per-clip mute toggle in properties panel
- Track 2 continues over black if Track 1 ends before Track 2
- Empty track handling: Export works with Track 1 only (normal), Track 2 only (full-screen), or both (PIP); error if both tracks empty

## Implementation Tasks

### 1. Data Model Changes

- Add `track` property to clip objects (1 = main, 2 = overlay)
- Add `muted` property to clip objects (boolean, default false)
- Update `timelineClips` handling to support track separation
- Modify clip data structure to allow free positioning (remove auto-sequential logic)
- Separate clips by track internally for rendering/processing

### 2. Timeline UI Updates

- Add Track 2 row to HTML (`track-2` with `track-2-content`)
- Update `renderTimeline()` to render clips on correct tracks
- Style Track 2 clips distinctly (different color/border to distinguish from Track 1)
- Update track labels ("Track 1 - Main" and "Track 2 - Overlay")
- Position Track 2 above Track 1 visually in timeline

### 3. Drag-and-Drop System

- Modify `addClipToTimeline()` to accept track parameter
- Update drop handlers to detect which track was dropped on
- Add visual drop zone indicators for tracks during drag
- Store track number in clip object on creation
- Handle drag from media library to specific track

### 4. Free Positioning with Smart Snapping

- Remove automatic sequential positioning
- Calculate clip position from drag/mouse position
- Implement smart snapping:
- Snap to playhead position
- Snap to edges of other clips (same track)
- Snap to ruler markers (at current zoom interval)
- Add Shift key modifier to disable snapping (free positioning)
- Visual feedback when snapping occurs (highlight snapped position)
- Prevent overlap on same track (reject drop if would overlap existing clip)

### 5. Gap Detection & Export Warning

- Detect gaps before export (empty time segments on tracks)
- Calculate gap duration and position for each track
- Show modal dialog on export button click if gaps detected:
- List gap locations and durations per track
- Warning that gaps will be filled with black frames
- Show total timeline duration vs content duration
- Confirm/Cancel buttons
- Only proceed with export after user confirmation

### 6. Composite Preview

- Create canvas-based preview compositor (similar to recording feature)
- Overlay Track 2 video on Track 1 when both tracks have active clips at current time
- PIP positioning: bottom-right, 25% canvas width, maintain aspect ratio, 10px padding
- Handle multiple Track 2 clips (overlay whichever clip is active at current time)
- Update preview when playhead moves to sync clips from both tracks
- Handle cases where only one track has content (show that track normally)
- Handle Track 2 extending beyond Track 1 (show over black)

### 7. FFmpeg Export Updates

- Modify `exportConcat()` in `src/ffmpeg/wrapper.js` to handle multi-track overlay
- Use FFmpeg `filter_complex` with `overlay` filter
- Process clips from both tracks:
- Create base video from Track 1 clips (with gaps filled with black)
- Overlay Track 2 clips at correct positions and times
- Handle multiple Track 2 clips overlaying at different times
- Fill gaps with black frames (`color` filter or `fps` + `setpts`)
- Ensure overlay timing matches clip positions on timeline
- Handle empty track cases:
- Track 1 only: Export normally
- Track 2 only: Export as full-screen (no overlay effect)
- Both tracks: Composite with PIP overlay
- Audio mixing: Combine audio from both tracks, respect muted clips

### 8. Properties Panel Updates

- Show track number for selected clip
- Add Mute/Unmute toggle button (works for both Track 1 and Track 2 clips)
- Store `muted` property on clip object
- Update visual indication on timeline clip if muted
- Keep standard properties (in/out points, name, delete)
- Future: PIP size/position controls (not for MVP)

### 9. Timeline Interaction Updates

- Update click-to-seek to work across both tracks
- Update playhead to show correctly over both tracks
- Update zoom to affect both tracks uniformly
- Ensure ruler works for full timeline duration (max of both tracks)
- Update selection to work per-track

### 10. Clip Management

- Ensure delete/trim operations work per-track
- Update `recalculateTimelinePositions()` to be removed (free positioning)
- Handle clip splitting on specific tracks (maintain track number)
- Validate track has at least one clip before export (but allow single-track exports)

## Files to Modify

- `src/renderer/index.html` - Add Track 2 HTML structure, export warning modal, mute button in properties
- `src/renderer/renderer.js` - Core timeline rendering, drag-drop, positioning, preview compositing, gap detection, mute toggle
- `src/ffmpeg/wrapper.js` - Export logic with overlay filter, gap filling, audio mixing
- CSS in `index.html` - Track styling, visual distinction, muted clip styling

## Technical Notes

- Smart snap threshold: ~5-10 pixels at current zoom level
- Gap detection: Scan timeline for empty time segments between clips per track, also check before first clip and after last clip
- Export FFmpeg filter_complex: Use `overlay=W-w-10:H-h-10` for bottom-right PIP positioning
- Preview canvas compositing: Similar to existing `compositeStreams()` function, but for timeline preview
- Audio mixing: Use `amix` or `amerge` filter to combine audio streams, check muted property per clip
- Track separation: Use `timelineClips.filter(c => c.track === 1)` and `timelineClips.filter(c => c.track === 2)` for processing