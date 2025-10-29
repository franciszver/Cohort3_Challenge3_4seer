<!-- 842efb9f-89fc-431e-93ae-e42c06d4269f e125ce88-8184-4a17-9204-fddaadd2e1c4 -->
# AI Press Kit Generation Feature

## Overview

After a successful video export, prompt the user to generate an AI-powered media press kit. The feature will:

1. Show a one-time popup per export asking "Do you want to generate a media press kit?"
2. Transcribe the exported video using AWS Transcribe
3. Extract a thumbnail/screenshot from the video
4. Generate a styled HTML press kit using OpenAI API based on the transcription
5. Save the press kit as `{videoname}_presskit.html` in the same directory as the exported video

## Implementation Plan

### 1. Dependencies & Setup

**Files to modify:**

- `package.json` - Add AWS SDK v3 and OpenAI SDK dependencies

**New dependencies:**

- `@aws-sdk/client-transcribe` - AWS Transcribe service client
- `@aws-sdk/credential-providers` - For AWS credentials management
- `openai` - OpenAI API client
- `@aws-sdk/client-s3` (optional) - Only if using S3 for audio file upload

### 2. Secure API Key Storage Module

**New file:** `src/main/config-manager.js`

- Use Electron's `safeStorage` API for encrypting sensitive data
- Store/retrieve OpenAI API key and AWS credentials
- Provide helper functions for checking if encryption is available
- Store encrypted data in `app.getPath('userData')` directory

**IPC handlers in `src/main.js`:**

- `get-api-key` - Retrieve stored API key (decrypted)
- `set-api-key` - Store and encrypt API key
- `check-encryption-available` - Check if safeStorage is supported

### 3. Settings UI for API Keys

**New file:** `src/renderer/settings-modal.html` (inline in `index.html`)

- Modal dialog for entering OpenAI API key and AWS credentials (Access Key ID, Secret Access Key, Region)
- Store credentials using IPC calls to main process
- Validate format before storing
- Show encryption status

**Render integration:**

- Add "Settings" button/menu item (optional - can be accessed on first use or via keyboard shortcut)
- Show settings modal when API keys are missing or on user request

### 4. AWS Transcribe Integration

**New file:** `src/main/transcribe-service.js`

- Extract audio from video using FFmpeg (wrapper already exists)
- Upload audio file to temporary S3 bucket OR use direct file upload
- Start Transcribe job with appropriate settings (language code, media format)
- Poll for job completion
- Retrieve transcription result
- Clean up temporary files

**IPC handler in `src/main.js`:**

- `transcribe-video` - Accept video path, return transcription text

**Note:** AWS Transcribe requires either:

- S3 bucket for storing audio (needs S3 SDK)
- Or direct file upload (if supported by AWS SDK version)

### 5. Thumbnail Extraction for Press Kit

**Modify:** `src/ffmpeg/wrapper.js` (or create new helper)

- Extract a single high-quality thumbnail/screenshot from video
- Capture at midpoint or first 10% of video (configurable)
- Return image path for embedding in HTML

**IPC handler in `src/main.js`:**

- `extract-presskit-thumbnail` - Extract thumbnail, return base64 or file path

### 6. OpenAI Press Kit Generation

**New file:** `src/main/presskit-generator.js`

- Build prompt for OpenAI API with transcription content
- Include the press kit template structure
- Call OpenAI API (gpt-4 or gpt-3.5-turbo) to generate content
- Format response as HTML with proper styling
- Embed thumbnail image (base64 or relative path)
- Return complete HTML document

**IPC handler in `src/main.js`:**

- `generate-presskit` - Accept transcription, thumbnail path, return HTML content

### 7. Post-Export Popup UI

**Modify:** `src/renderer/renderer.js`

- In `exportConcatenated()` function, after successful export:
- Show a modal popup asking "Do you want to generate a media press kit?" (Yes/No)
- Store export path for press kit generation

**New UI elements in `src/renderer/index.html`:**

- Press kit generation modal
- Progress indicator for transcription and generation steps
- Error message display

### 8. Press Kit Generation Workflow

**Modify:** `src/renderer/renderer.js`

- Handle "Yes" click from popup:

1. Check if API keys are configured (if not, prompt for settings)
2. Show progress: "Transcribing video..."
3. Call `transcribe-video` IPC handler
4. Show progress: "Extracting thumbnail..."
5. Call `extract-presskit-thumbnail` IPC handler
6. Show progress: "Generating press kit..."
7. Call `generate-presskit` IPC handler
8. Save HTML file to same directory as exported video with `_presskit.html` suffix
9. Show success message or error if any step fails

### 9. Error Handling

**Error scenarios:**

- API keys not configured → Show settings modal
- Video file moved/deleted → Show error: "Video file no longer exists"
- Transcription fails → Show error: "Failed to transcribe video"
- OpenAI API fails → Show error: "Failed to generate press kit"
- Network errors → Show error with retry option (optional)
- All errors should gracefully stop and show user-friendly message

### 10. HTML Press Kit Template

**Styling requirements:**

- Modern, professional design
- Dark/light theme appropriate
- Responsive layout
- Proper typography for readability
- Embedded thumbnail/screenshot
- Formatted sections matching the provided template structure

**Template structure:**

- Product Name (from AI analysis)
- Overview paragraph
- Elevator Pitch
- Key Features (bullet points)
- Use Cases
- Tech Stack
- Demo Highlights
- Founder Quote
- Social Media Content (Twitter/X, Instagram, LinkedIn, TikTok)
- Press Contact

## File Changes Summary

**New files:**

- `src/main/config-manager.js` - Secure storage for API keys
- `src/main/transcribe-service.js` - AWS Transcribe integration
- `src/main/presskit-generator.js` - OpenAI API integration for press kit generation

**Modified files:**

- `src/main.js` - Add IPC handlers for transcription, press kit generation, config management
- `src/renderer/renderer.js` - Add post-export popup and press kit generation workflow
- `src/renderer/index.html` - Add settings modal and press kit generation modal
- `src/ffmpeg/wrapper.js` - Add thumbnail extraction function (or new helper)
- `package.json` - Add AWS SDK and OpenAI dependencies

## Testing Considerations

- Test with various video lengths (short < 1min, medium 1-5min, long > 5min)
- Test error scenarios (missing API keys, invalid credentials, network failures)
- Verify encrypted storage works correctly
- Test thumbnail extraction from different video formats
- Verify HTML press kit is properly formatted and viewable in browsers
- Ensure existing export functionality remains unaffected