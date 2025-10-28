# MVP Product Requirements Document (PRD)

## Product Name
**4Seer MVP Video Editor**

## Purpose
Deliver a minimal, installable desktop video editor that validates the core workflow:
**Import → Preview → Trim → Export.**

This MVP proves the technical pipeline (decode → edit → encode) and packaging (native installer with FFmpeg bundled). It is not intended to compete with full-featured NLEs at this stage.

---

## Target Users
- Content creators who need a **fast, lightweight tool** for trimming clips.
- Developers/contributors validating the **core architecture** for future expansion.

---

## MVP Scope

### Core Features
1. **App Launch**
   - Built with Electron.
   - Packaged as a native `.exe` installer (Windows first).
   - FFmpeg binary bundled inside the installer.

2. **Video Import**
   - Drag & drop or file picker.
   - Supported formats: MP4, MOV (H.264/AAC baseline).

3. **Timeline View**
   - Simple, single-track timeline.
   - Shows imported clip(s) in sequence.
   - No multi-track, transitions, or effects.

4. **Video Preview**
   - Embedded player for playback of imported clips.
   - Basic playback controls: play, pause, scrub.

5. **Trim Functionality**
   - Set **in** and **out** points on a single clip.
   - Visual markers on the timeline.
   - Preview reflects trimmed range.

6. **Export**
   - Export trimmed clip(s) to MP4 using FFmpeg.
   - Default settings: H.264 video, AAC audio, MP4 container.
   - Output path selectable by user.

---

## Technical Requirements
- **Framework**: Electron.
- **Bundled Dependency**: FFmpeg binary included in installer.
- **Build Tools**: `electron-builder` with `extraResources` for FFmpeg.
- **Supported OS**: Windows 10/11 (64-bit).
- **Installer Output**: `.exe` installer with self-contained runtime.

---

## Success Criteria
- User can install `.exe` without external dependencies.
- User can import an MP4/MOV file.
- User can set in/out points and preview the trimmed range.
- User can export a trimmed MP4 file that plays correctly.
- **User can export a timeline of multiple-trimmed MP4 file that plays correctly.**
- App runs outside of dev mode (packaged build).

---

## Contributor Notes
- Keep code modular: separate **UI layer** (Electron frontend) from **processing layer** (FFmpeg calls).
- Document folder structure and build steps clearly in `README.md`.
- Provide example commands for FFmpeg trim/export in developer docs.
- Ensure installer includes FFmpeg and resolves paths correctly in packaged mode.
