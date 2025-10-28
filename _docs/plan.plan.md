<!-- 23e9ade5-ac72-4020-b30a-b9272be3b2d2 b9bdc391-226d-4ace-bc5a-9ed3b42b01c5 -->
# MVP Video Editor - Windows Plan

## Overview

Implement a minimal Electron app that imports MP4/MOV via drag-and-drop, displays a single-track timeline, supports in/out trimming on a single clip, and exports a single concatenated MP4 using a bundled FFmpeg. Windows-only packaging, default presets, manual testing.

## Assumptions

- Drag-and-drop import area in the renderer (no keyboard accessibility support yet).
- Only MP4 and MOV inputs; default FFmpeg export presets.
- A single concatenated MP4 export for multiple segments; if multiple trimmed segments exist, concatenate them in order.
- Simple in-memory data model for clips (id, path, inPoint, outPoint, order).
- FFmpeg binary is bundled under `resources/ffmpeg/ffmpeg.exe` and resolved via `process.resourcesPath` in packaged builds.
- No automated tests; manual testing after completion.
- Windows packaging only for MVP; cross-platform can be considered later.

## High-Level Architecture

- `src/main.ts` (Electron main process)
- `src/renderer/index.html` + `src/renderer/index.tsx` (UI with drag-and-drop area, timeline, and export controls)
- `src/ffmpeg/wrapper.ts` (FFmpeg command composition and execution)
- `package.json` scripts for `dev`, `build`, and `package`
- `resources/ffmpeg/ffmpeg.exe` (bundled binary in repo for development)

## Plan by Phases

1) Scaffolding

- Create Electron app structure, basic window, and package.json setup.
- Wire a minimal renderer with a placeholder UI.

2) Import UI

- Implement drag-and-drop area and file picker (MP4/MOV filter).
- Validate and store imported clip path(s).

3) Data Model & Timeline

- Define a simple `Clip` interface: { id, path, inPoint, outPoint, order }.
- Render a single-track timeline showing imported clips in sequence.

4) Trim Functionality

- Add UI to set in/out points for the selected clip.
- Persist inPoint/outPoint in the clip model and reflect in preview.

5) Preview

- Embed a video element; synchronize with timeline trim markers.

6) Export

- Implement FFmpeg wrapper to export a single concatenated MP4:
- If one clip: trim with inPoint/outPoint.
- If multiple clips: create temporary segment list and use FFmpeg concat to join, with default H.264/AAC presets.
- Prompt user for an output path and perform the export.

7) Packaging

- Configure `electron-builder` for Windows, bundling `resources/ffmpeg/ffmpeg.exe`.
- Resolve FFmpeg path at runtime via `process.resourcesPath` when packaged.

8) Documentation & QA

- Update MVP docs later; note manual testing steps for the app.

## Key Files & Targets

- `src/main.ts`, `src/renderer/index.html`, `src/renderer/index.tsx`, `src/ffmpeg/wrapper.ts`
- `package.json` (scripts/config for Windows build)
- `resources/ffmpeg/ffmpeg.exe`

## Acceptance Criteria (Manual)

- App launches on Windows from packaged `.exe`.
- Drag-and-drop MP4/MOV imports work.
- A single-track timeline displays imported clips.
- In/out trimming updates clip metadata and preview.
- Export yields a single MP4 with the concatenated trimmed segments using bundled FFmpeg.

## Risks & Mitigations

- Basic FFmpeg command correctness; keep presets conservative and test locally.
- Simple in-memory data model may need refactoring if requirements expand.

## Next Steps

- Confirm this plan and I’ll initiate plan-driven work items in the repo via the Todo system and start scaffolding.