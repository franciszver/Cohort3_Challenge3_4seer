# Testing Guide - OpenShot UI Redesign

## Quick Start

```bash
npm start
```

## Test Scenarios

### 1. Basic Import and Preview
**Expected Result:** Files import to library, can be previewed

**Steps:**
1. Launch app
2. Drag an MP4 file onto the "Project Files" dropzone (top-left panel)
3. Verify clip appears in Project Files list with video icon and filename
4. Drag the clip from Project Files onto the timeline (Track 1)
5. Verify clip appears on timeline with colored rectangle
6. Click the clip on timeline
7. Verify video loads in preview window (top-right)
8. Click Play button
9. Verify video plays and playhead moves across timeline

### 2. Thumbnail Generation
**Expected Result:** Filmstrip thumbnails appear inside timeline clips

**Steps:**
1. Add a clip to timeline (drag from library)
2. Observe "Loading..." text inside clip
3. Wait 5-10 seconds
4. Verify multiple thumbnail images appear inside the clip
5. Add a longer video (>30 seconds)
6. Verify more thumbnails appear for longer clips

### 3. Edge-Dragging to Trim
**Expected Result:** Clip edges can be dragged to trim, Properties panel updates

**Steps:**
1. Add clip to timeline
2. Hover over left edge of clip
3. Verify cursor changes to resize (↔)
4. Click and drag left edge to the right
5. Verify clip shortens from the start
6. Verify "In Point" value in Properties panel updates in real-time
7. Release mouse
8. Hover over right edge of clip
9. Click and drag right edge to the left
10. Verify clip shortens from the end
11. Verify "Out Point" value in Properties panel updates in real-time

### 4. Reordering Clips
**Expected Result:** Clips can be dragged to reorder on timeline

**Steps:**
1. Add 3 clips to timeline
2. Click and hold on the middle of the second clip
3. Verify clip becomes semi-transparent (opacity 0.6)
4. Drag clip to the left (before first clip)
5. Release mouse
6. Verify clip order changes
7. Verify timeline recalculates positions (clips are sequential)

### 5. Properties Panel Bidirectional Binding
**Expected Result:** Changing Properties panel updates timeline, and vice versa

**Steps:**
1. Add clip to timeline and select it
2. Note current In Point and Out Point values
3. Drag left edge of clip on timeline
4. Verify In Point input in Properties panel updates
5. Type a new value in Out Point input (e.g., 5.0)
6. Press Enter or click "Apply Trim"
7. Verify clip right edge moves on timeline
8. Verify clip width changes

### 6. Timeline Zoom
**Expected Result:** Timeline zooms in/out, clips scale accordingly

**Steps:**
1. Add 2-3 clips to timeline
2. Note current clip widths
3. Click Zoom In (+) button 3 times
4. Verify clips get wider
5. Verify time ruler markers adjust (more markers visible)
6. Click Zoom Out (−) button 5 times
7. Verify clips get narrower
8. Verify time ruler markers adjust (fewer markers visible)

### 7. Playhead and Timeline Seeking
**Expected Result:** Playhead syncs with video, clicking timeline seeks video

**Steps:**
1. Add clip to timeline and select it
2. Click Play button
3. Verify red playhead line moves across timeline in sync with video
4. Pause video
5. Click on timeline ruler at a different position
6. Verify playhead jumps to that position
7. Verify video seeks to that time

### 8. Transport Controls
**Expected Result:** All transport buttons work correctly

**Steps:**
1. Add clip to timeline and select it
2. Click Play button (▶)
3. Verify video plays and button changes to Pause (⏸)
4. Click Pause button
5. Verify video pauses
6. Click Rewind button (⏮)
7. Verify video jumps back 5 seconds
8. Click Forward button (⏭)
9. Verify video jumps forward 5 seconds

### 9. Export Workflow
**Expected Result:** Only timeline clips export with correct trim and order

**Steps:**
1. Import 3 clips to library
2. Add only 2 clips to timeline
3. Trim first clip (drag left edge to 2 seconds)
4. Trim second clip (drag right edge to 5 seconds)
5. Reorder clips (drag second before first)
6. Click "Export Video" button
7. Choose save location
8. Wait for export to complete
9. Verify progress bar shows progress
10. Open exported video in media player
11. Verify only 2 clips are in export (not all 3)
12. Verify clips are in reordered sequence
13. Verify trim points are respected

### 10. Multiple Clips Sequential Playback
**Expected Result:** Clips play in sequence on timeline

**Steps:**
1. Add 3 clips to timeline
2. Verify clips are positioned sequentially (no gaps)
3. Select first clip
4. Click Play
5. Verify video plays first clip
6. When first clip ends, verify second clip starts playing
7. Verify playhead continues across all clips

### 11. Drag-and-Drop Import
**Expected Result:** Multiple files can be imported at once

**Steps:**
1. Select 3 MP4 files in file explorer
2. Drag all 3 files onto Project Files dropzone
3. Verify all 3 clips appear in library
4. Drag each clip to timeline one by one
5. Verify all clips can be added to timeline

### 12. Click-to-Import
**Expected Result:** File picker dialog works

**Steps:**
1. Click on Project Files dropzone (don't drag)
2. Verify file picker dialog opens
3. Select an MP4 file
4. Click Open
5. Verify clip appears in library

### 13. Cancel Export
**Expected Result:** Export can be cancelled

**Steps:**
1. Add multiple long clips to timeline
2. Click Export Video
3. Choose save location
4. Wait for export to start
5. Press Escape key
6. Verify export status shows "Export canceled"

### 14. Edge Cases

#### Minimum Clip Duration:
1. Add clip to timeline
2. Drag right edge very close to left edge
3. Verify clip cannot be shorter than 0.1 seconds

#### Trim Beyond Duration:
1. Add clip to timeline
2. In Properties panel, type Out Point value larger than clip duration
3. Click Apply Trim
4. Verify Out Point is clamped to clip duration

#### Empty Timeline Export:
1. Import clips to library but don't add to timeline
2. Click Export Video
3. Verify error message: "No clips on timeline to export"

## Visual Verification Checklist

- [ ] Dark theme applied throughout (no white backgrounds)
- [ ] 4 panels visible and properly sized
- [ ] Project Files panel shows clips with icons
- [ ] Video preview fills top-right panel
- [ ] Transport controls visible below video
- [ ] Properties panel shows trim inputs
- [ ] Export button and progress bar visible
- [ ] Timeline shows Track 1 label
- [ ] Time ruler shows timestamps
- [ ] Playhead is red and visible
- [ ] Zoom controls visible in timeline toolbar
- [ ] Timeline clips are colored rectangles
- [ ] Thumbnails appear inside clips (filmstrip view)
- [ ] Clip labels show filenames
- [ ] Resize handles visible on clip edges

## Performance Checks

- [ ] App launches in < 5 seconds
- [ ] File import is instant
- [ ] Drag to timeline is smooth
- [ ] Thumbnail extraction doesn't block UI
- [ ] Playhead moves smoothly during playback
- [ ] Edge-dragging is responsive
- [ ] Zoom is smooth (may lag with 10+ clips)
- [ ] Export progress updates regularly

## Browser Console Checks

Open DevTools (F12) and check for:
- [ ] No red errors in console
- [ ] Thumbnail extraction logs (if any) show success
- [ ] No "Failed to import file" errors
- [ ] No "Failed to extract thumbnails" errors

## Regression Testing

Verify original MVP features still work:
- [ ] MP4 and MOV formats supported
- [ ] FFmpeg bundled and working
- [ ] Temp files cleaned up on exit
- [ ] Export uses H.264/AAC encoding
- [ ] Concat workflow works for multiple clips

## Known Issues to Ignore

These are expected limitations (not bugs):
1. Only Track 1 is functional
2. No audio waveforms displayed
3. Clips must be sequential (no gaps allowed)
4. No transitions between clips
5. Thumbnail quality is low-res
6. No keyboard shortcuts (except Escape to cancel export)

## Reporting Issues

If you find bugs, note:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Console errors (if any)
5. Video file details (format, duration, size)

## Success Criteria

All test scenarios pass, and:
- UI matches OpenShot's layout and styling
- All drag-and-drop workflows work smoothly
- Thumbnails generate and display correctly
- Edge-dragging trim is intuitive and responsive
- Export produces valid MP4 files
- No crashes or freezes during normal use

