# Quick Reference - OpenShot-Style MVP

## Running the App

```bash
npm start
```

## Interface Layout

```
┌─────────────────────────────────────────────────────────┐
│  PROJECT FILES          │  VIDEO PREVIEW                │
│  (Media Library)        │  [Video Player]               │
│                         │  [⏮ ▶ ⏭] Transport Controls  │
├─────────────────────────┼───────────────────────────────┤
│  PROPERTIES             │  TIMELINE                     │
│  In Point: [____]       │  [Time Ruler]                 │
│  Out Point: [____]      │  Track 1: [Clips with thumbs] │
│  [Apply Trim]           │  [− Zoom +]                   │
│  [Export Video]         │                               │
└─────────────────────────┴───────────────────────────────┘
```

## Basic Workflow

### 1. Import Files
- **Drag & Drop:** Drag MP4/MOV files onto "Project Files" panel
- **Click:** Click dropzone to open file picker

### 2. Add to Timeline
- **Drag:** Drag clips from Project Files onto Track 1
- Clips appear with filmstrip thumbnails (wait a few seconds)

### 3. Trim Clips
**Method 1 - Edge Dragging (Direct Manipulation):**
- Hover over clip edge until cursor changes to ↔
- Drag left edge: trim start
- Drag right edge: trim end

**Method 2 - Properties Panel:**
- Select clip on timeline
- Type In Point / Out Point values
- Press Enter or click "Apply Trim"

### 4. Reorder Clips
- Click and drag clip body (not edges)
- Drop at new position

### 5. Preview
- Click clip to select
- Click Play button (▶)
- Use Rewind (⏮) / Forward (⏭) to skip ±5 seconds
- Click timeline ruler to seek

### 6. Export
- Click "Export Video" button
- Choose save location
- Wait for completion
- Press Escape to cancel

## Mouse Actions

| Action | Result |
|--------|--------|
| Drag file onto Project Files | Import to library |
| Drag library clip onto timeline | Add to timeline |
| Click timeline clip | Select clip |
| Drag clip edge | Trim clip |
| Drag clip body | Reorder clip |
| Click timeline ruler | Seek video |
| Click Play button | Play/Pause video |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Escape | Cancel export |
| Enter | Apply trim (when in Properties input) |

## Visual Indicators

| Element | Meaning |
|---------|---------|
| Red vertical line | Playhead (current time) |
| Blue border on clip | Selected clip |
| Semi-transparent clip | Being dragged |
| ↔ cursor | Resize mode (trim) |
| "Loading..." | Thumbnails generating |

## Zoom Controls

- **Zoom In (+):** Makes clips wider (more detail)
- **Zoom Out (−):** Makes clips narrower (see more timeline)
- Range: 10-200 pixels per second
- Default: 50 pixels per second

## Properties Panel

| Field | Description |
|-------|-------------|
| In Point | Trim start time (seconds) |
| Out Point | Trim end time (seconds) |
| Apply Trim | Apply manual trim values |
| Export Video | Export timeline to MP4 |

## Tips & Tricks

1. **Thumbnails take time:** Wait 5-10 seconds after adding clip to timeline
2. **Bidirectional trim:** Edge-dragging updates Properties panel and vice versa
3. **Sequential clips:** Clips automatically position end-to-end (no gaps)
4. **Library vs Timeline:** Only timeline clips are exported
5. **Minimum duration:** Clips cannot be trimmed below 0.1 seconds
6. **Playhead sync:** Playhead follows video playback in real-time

## Common Tasks

### Trim Multiple Clips
1. Add all clips to timeline
2. Select first clip
3. Drag edges to trim
4. Select next clip
5. Repeat

### Reorder and Export
1. Add clips to timeline
2. Drag clips to desired order
3. Click Export Video
4. Clips export in timeline order

### Preview Specific Section
1. Click timeline at desired time
2. Video seeks to that position
3. Click Play to preview from there

### Adjust Trim After Export
1. Change trim points on timeline
2. Click Export Video again
3. New export reflects changes

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Thumbnails not showing | Wait longer (10-20 seconds for long clips) |
| Can't drag clip edge | Make sure hovering over edge (within 10px) |
| Export fails | Check console (F12) for errors |
| Playhead not moving | Make sure video is playing (click Play button) |
| Clip won't trim shorter | Minimum duration is 0.1 seconds |

## File Support

- **Formats:** MP4, MOV
- **Codecs:** H.264 video, AAC audio
- **Export:** MP4 (H.264/AAC)

## Performance Notes

- Thumbnail extraction runs in background (doesn't block UI)
- Zoom may lag with 10+ clips on timeline
- Export time depends on clip count and duration
- Temp files cleaned up automatically on exit

## Differences from OpenShot

**Not Implemented (MVP Limitations):**
- Multi-track editing (only Track 1)
- Transitions between clips
- Video effects/filters
- Audio waveforms
- Clip splitting
- Markers
- Snap-to-grid
- Undo/redo

**Implemented (OpenShot-Style):**
- 4-panel layout
- Dark theme
- Media library workflow
- Drag-and-drop
- Filmstrip thumbnails
- Edge-dragging trim
- Drag-to-reorder
- Playhead sync
- Timeline ruler
- Zoom controls
- Transport controls

## Getting Help

1. Check `_docs/TESTING_GUIDE.md` for detailed test scenarios
2. Check `_docs/IMPLEMENTATION_SUMMARY.md` for technical details
3. Open DevTools (F12) to see console errors
4. Check temp directory cleanup on exit

## Build for Distribution

```bash
npm run build
```

Output: `dist/4Seer Setup 1.0.0.exe`

