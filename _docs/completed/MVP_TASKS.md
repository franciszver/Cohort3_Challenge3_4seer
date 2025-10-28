# Tasks for 4Seer MVP Video Editor

This document lists development tasks derived from the MVP PRD.  
Each section corresponds to a core feature or requirement.

---

## 1. App Launch & Packaging
- [ ] Initialize Electron project structure.
- [ ] Configure `main.js` and `renderer` entry points.
- [ ] Add `electron-builder` to project.
- [ ] Configure `package.json` build settings (`appId`, `productName`, etc.).
- [ ] Ensure `resources\ffmpeg\ffmpeg.exe` is bundled into the installer via `extraResources`.
- [ ] Verify packaged `.exe` installs and launches on Windows 10/11.

---

## 2. Video Import
- [ ] Implement drag & drop area in renderer.
- [ ] Implement file picker dialog (MP4/MOV filter).
- [ ] Validate file type and reject unsupported formats.
- [ ] Display imported clip(s) in a simple timeline view.

---

## 3. Timeline View
- [ ] Create single-track timeline component.
- [ ] Render imported clip(s) as timeline blocks.
- [ ] Add ability to select a clip on the timeline.
- [ ] Show visual markers for trim in/out points.
- [ ] Enable basic clip reordering (optional stretch goal).

---

## 4. Video Preview
- [ ] Embed video player component in renderer.
- [ ] Connect player to imported clip(s).
- [ ] Add playback controls (play, pause, scrub).
- [ ] Sync preview with timeline trim markers.

---

## 5. Trim Functionality
- [ ] Implement UI for setting **in** and **out** points.
- [ ] Store trim metadata for each clip.
- [ ] Update preview to reflect trimmed range.
- [ ] Allow multiple trim segments per clip.
- [ ] Display trimmed segments on the timeline.

---

## 6. Export
- [ ] Implement FFmpeg wrapper in main process.
- [ ] Resolve path to `resources\ffmpeg\ffmpeg.exe` at runtime (`process.resourcesPath` in packaged mode).
- [ ] Pass trim metadata to FFmpeg command.
- [ ] Support exporting a single trimmed clip.
- [ ] Support exporting a timeline of multiple trimmed clips (concat workflow).
- [ ] Default export settings: H.264 video, AAC audio, MP4 container.
- [ ] Add file save dialog for export path.
- [ ] Verify exported MP4 plays correctly in standard players.

---

## 7. Technical Requirements
- [ ] Ensure `resources\ffmpeg\ffmpeg.exe` is included in installer.
- [ ] Test app outside dev mode to confirm no missing dependencies.
- [ ] Document build steps in `README.md`.

---

## 8. Success Criteria Validation
- [ ] Install `.exe` on a clean Windows machine (no dev tools).
- [ ] Import MP4/MOV file successfully.
- [ ] Set in/out points and preview trimmed range.
- [ ] Export single trimmed MP4 file and verify playback.
- [ ] Export multiple-trimmed timeline MP4 file and verify playback.
- [ ] Confirm app runs correctly outside dev mode.

---

## 9. Contributor Notes
- [ ] Document folder structure (src, dist, docs, resources\ffmpeg).
- [ ] Provide FFmpeg command examples for trimming and concat.
- [ ] Add developer notes on Electron main vs renderer responsibilities.
- [ ] Clarify how to add new features without breaking MVP scope.

---

### 10. Runtime Export Progress UI
- [ ] Display live progress/status during FFmpeg export (in progress, completed, failed)
### 6.1 Export Progress UI
- [ ] Display live progress during FFmpeg export (per-segment and overall)
### 6.2 Cancellation Support
- [ ] Allow user to cancel an ongoing export (wired via IPC)
### 6.3 Robust Export Strategy
- [ ] Implement two-pass export: copy-then-encode fallback (as MVP)