<!-- 4c2dcaa5-2fc5-4e63-b881-0e1739296e25 b1976eda-627c-4da3-978c-964e983ee688 -->
# Clip Splitting Feature Implementation Plan

## Overview

Add the ability to split a timeline clip into two separate clips by right-clicking on the timeline at a desired position. The split will occur at the clicked timeline position, creating two clips that reference the same source file with adjusted in/out points.

## User Flow

1. User right-clicks on a timeline clip (or empty timeline space at a clip's position)
2. Context menu appears with "Split Clip" option
3. If clicked position is within a clip bounds, split the clip
4. Original clip becomes "left" clip (maintains original inPoint, new outPoint at split)
5. New "right" clip created (new inPoint at split, maintains original outPoint)
6. Timeline repositions clips automatically

## Files to Modify

### 1. `src/renderer/index.html`

**Changes:**

- Add CSS for context menu styling (dark theme consistent with app)
- Context menu will be dynamically created in JavaScript, but add base styles

### 2. `src/renderer/renderer.js`

**Changes:**

#### Add Context Menu State

```javascript
let contextMenu = null;
let contextMenuClipIndex = null;
let contextMenuTimelineTime = null;
```

#### Add Function: `showContextMenu(event)`

- Create context menu element if it doesn't exist
- Position menu at click coordinates
- Determine if click is on a clip or empty timeline space
- Find which clip contains the clicked timeline position using logic similar to `seekToTimelinePosition()`
- Store clip index and timeline time for split operation
- Show menu with "Split Clip" option (only if click is within a clip's bounds)
- Add click-outside listener to close menu

#### Add Function: `splitClipAtTimelineTime(clipIndex, timelineTime)`

- Get the clip at clipIndex from `timelineClips[]`
- Validate split is possible (not at clip boundaries, minimum duration)
- Calculate local split time within clip:
  ```javascript
  const clipStart = clip.startTime || 0;
  const localSplitTime = clip.inPoint + (timelineTime - clipStart);
  ```

- Validate localSplitTime is between inPoint and outPoint
- Validate minimum durations (0.1s for each resulting clip)
- Create left clip (existing clip with modified outPoint):
  ```javascript
  clip.outPoint = localSplitTime;
  ```

- Create right clip (new clip with modified inPoint):
  ```javascript
  const rightClip = {
    id: 'timeline_' + Date.now() + '_' + Math.random(),
    sourceId: clip.sourceId,
    path: clip.path,
    originalPath: clip.originalPath,
    name: clip.name,
    duration: clip.duration,
    inPoint: localSplitTime,
    outPoint: clip.outPoint, // Original outPoint preserved
    startTime: 0, // Will be recalculated
    thumbnails: [], // Will be regenerated
    thumbnailsLoading: true
  };
  ```

- Insert right clip after left clip: `timelineClips.splice(clipIndex + 1, 0, rightClip)`
- Recalculate all timeline positions: `recalculateTimelinePositions()`
- Update selected clip index if needed
- Trigger thumbnail extraction for new right clip: `extractThumbnailsForClip(rightClip)`
- Re-render timeline: `renderTimeline()`

#### Add Function: `hideContextMenu()`

- Remove context menu from DOM
- Clear stored state

#### Modify Timeline Click Handler

- Add `contextmenu` event listener to `trackContent`
- Prevent default browser context menu
- Call `showContextMenu(event)`
- Also handle clicks on clip elements specifically

#### Add Context Menu HTML Structure (dynamically created)

```javascript
<div id="timeline-context-menu" class="context-menu">
  <div class="context-menu-item" id="splitClipOption">Split Clip</div>
</div>
```

## Implementation Details

### Finding Clip at Clicked Position

Use logic from `seekToTimelinePosition()` function (lines 536-554):

- Convert click coordinates to timeline time
- Loop through `timelineClips[]` to find clip where `time >= clipStart && time < clipEnd`
- Use `clip.startTime`, trimmed duration, and `clip.endTime` calculation

### Split Validation

- **Minimum duration check**: Each resulting clip must be >= 0.1s
- **Boundary check**: Cannot split at exact clip boundaries (start or end)
- **Valid range**: Split time must be within clip's current inPoint and outPoint

### Thumbnail Handling

- Left clip: Keep existing thumbnails but may need filtering if split point changes displayed range
- Right clip: Trigger `extractThumbnailsForClip()` in background (existing function at line 349)
- For simplicity, left clip thumbnails can remain; right clip will generate new ones

### Edge Cases

1. **Split at clip start/end**: Do nothing, show message or disable option
2. **Split would create clip < 0.1s**: Prevent split, show validation error
3. **Multiple clips overlap**: Shouldn't happen based on current sequential positioning, but validate clip bounds
4. **Live recording clips**: Should not be splittable (check for `isLive` flag)

### Context Menu Styling

- Dark theme: `background: #2a2a2a`, `border: 1px solid #3a3a3a`
- Menu item hover: `background: #3a3a3a`
- Position: absolute, z-index: 2000 (above clips)
- Shadow: `box-shadow: 0 4px 12px rgba(0,0,0,0.5)`

## Key Functions Location Reference

- Clip structure: `timelineClips[]` array (line 7)
- Find clip at time: `seekToTimelinePosition()` (lines 525-555)
- Recalculate positions: `recalculateTimelinePositions()` (lines 613-620)
- Extract thumbnails: `extractThumbnailsForClip()` (lines 349-361)
- Render timeline: `renderTimeline()` (lines 120-209)
- Timeline click handler: `trackContent.addEventListener('click')` (lines 491-500)

## Testing Checklist

- [ ] Right-click on clip shows context menu
- [ ] Right-click on empty timeline space shows no split option
- [ ] Split at middle of clip creates two clips correctly
- [ ] Split preserves original trim points appropriately
- [ ] Split prevents if resulting clips would be < 0.1s
- [ ] Split prevents at clip boundaries
- [ ] Timeline positions recalculate correctly after split
- [ ] Right clip gets thumbnails generated
- [ ] Left clip maintains its thumbnails
- [ ] Split clips can be trimmed individually
- [ ] Split clips can be exported correctly
- [ ] Context menu closes on outside click
- [ ] Context menu closes on Escape key
- [ ] Multiple splits work correctly on same clip

## Future Enhancements (Not in this MVP)

- Split with keyboard shortcut (S key)
- Split animation/visual feedback
- Undo/redo support for splits
- Split live recording clips (would require different handling)

### To-dos

- [ ] Add CSS styles for context menu in index.html (dark theme, positioning, z-index)
- [ ] Add context menu state variables (contextMenu element ref, clipIndex, timelineTime) in renderer.js
- [ ] Implement showContextMenu() function to create and position context menu, find clip at clicked position
- [ ] Implement hideContextMenu() function to remove menu and clear state
- [ ] Implement splitClipAtTimelineTime() function with validation, clip creation, and timeline updates
- [ ] Add contextmenu event listener to trackContent to show menu on right-click, prevent default browser menu
- [ ] Wire up 'Split Clip' menu item click to call splitClipAtTimelineTime() function
- [ ] Add Escape key handler to close context menu if open
- [ ] Test all split scenarios: middle split, boundary cases, minimum duration, thumbnail generation