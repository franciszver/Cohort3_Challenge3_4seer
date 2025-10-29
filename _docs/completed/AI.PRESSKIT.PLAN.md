<!-- 74185b70-1479-493a-9e56-add8edacc433 a9d9fadc-d246-44a6-9855-818002a632ca -->
# AI Press Kit Generation Feature with Settings Menu

## Overview

After a successful video export, prompt the user to generate an AI-powered media press kit. The feature requires users to configure API credentials after installation through a Settings menu. The complete workflow:

1. User configures OpenAI and AWS credentials via Settings menu (secured with Electron safeStorage)
2. After export, show popup asking "Do you want to generate a media press kit?"
3. Transcribe the exported video using AWS Transcribe
4. Extract a thumbnail/screenshot from the video
5. Generate a styled HTML press kit using OpenAI API based on the transcription
6. Save the press kit as `{videoname}_presskit.html` in the same directory as the exported video

## Security Implementation

Electron's `safeStorage` uses the OS credential manager:

- **Windows**: Uses Windows Credential Manager (DPAPI)
- **macOS**: Uses Keychain
- **Linux**: Uses libsecret

The encrypted data is tied to the **user account**, not the machine. If User B installs the app on a different machine (or under a different Windows user account), they **cannot** access User A's encrypted credentials - the encryption keys are different per-user.

**Security Best Practices:**

- Never log credential values (even masked portions)
- Use `safeStorage` exclusively for sensitive data
- Validate credential formats before storing
- Show clear encryption status to users
- Warn users if encryption is unavailable on their system

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

- Export helper functions:
- `setOpenAIKey(key)` - Encrypt and store OpenAI API key
- `getOpenAIKey()` - Retrieve and decrypt OpenAI API key
- `setAWSCredentials(accessKeyId, secretAccessKey, region)` - Encrypt and store AWS credentials
- `getAWSCredentials()` - Retrieve and decrypt AWS credentials
- `hasConfiguredCredentials()` - Check if credentials are configured
- `isEncryptionAvailable()` - Check if safeStorage is supported
- Use Electron's `safeStorage` API for encryption
- Store encrypted data as JSON in `app.getPath('userData')/config.json`
- Handle cases where safeStorage is unavailable (fallback warning)

### 3. Add IPC Handlers for Credentials

**Modify:** `src/main.js`

- Add IPC handlers:
- `check-encryption-available` - Returns boolean if encryption is supported
- `get-api-config` - Returns current credential status (masked keys for display)
- `set-openai-key` - Stores OpenAI API key (encrypted)
- `set-aws-credentials` - Stores AWS credentials (encrypted)
- `get-openai-key` - Retrieves decrypted OpenAI key (for API calls)
- `get-aws-credentials` - Retrieves decrypted AWS credentials (for API calls)
- `check-credentials-configured` - Returns boolean if all required credentials exist

### 4. Settings Modal UI

**Modify:** `src/renderer/index.html`

- Add Settings button (gear icon) in the Preview panel header, next to audio output selector
- Create settings modal with:
- Section for OpenAI API Key (password input with show/hide toggle)
- Section for AWS credentials:
  - Access Key ID (text input)
  - Secret Access Key (password input with show/hide toggle)
  - Region (text input with common region suggestions/dropdown)
- Encryption status indicator
- Save button
- Cancel button
- Form validation (API key format, AWS region validation)
- Match existing dark theme styling
- Modal overlay similar to recording modal
- Input fields with proper labels and validation messages

### 5. Settings Modal Logic

**Modify:** `src/renderer/renderer.js`

- Add functions:
- `openSettingsModal()` - Opens and populates settings modal
- `loadSettingsFromStorage()` - Loads current credential status (masked)
- `saveSettings()` - Validates and saves credentials via IPC
- `validateOpenAIKey(key)` - Basic validation (starts with "sk-")
- `validateAWSRegion(region)` - Validates AWS region format
- Add event listeners for Settings button click
- Show settings modal when credentials are missing (before press kit generation)
- Display encryption status and warnings

### 6. AWS Transcribe Integration

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

### 7. Thumbnail Extraction for Press Kit

**Modify:** `src/ffmpeg/wrapper.js` (or create new helper)

- Extract a single high-quality thumbnail/screenshot from video
- Capture at midpoint or first 10% of video (configurable)
- Return image path for embedding in HTML

**IPC handler in `src/main.js`:**

- `extract-presskit-thumbnail` - Extract thumbnail, return base64 or file path

### 8. OpenAI Press Kit Generation

**New file:** `src/main/presskit-generator.js`

- Build prompt for OpenAI API with transcription content
- Include the press kit template structure
- Call OpenAI API (gpt-4 or gpt-3.5-turbo) to generate content
- Format response as HTML with proper styling
- Embed thumbnail image (base64 or relative path)
- Return complete HTML document

**IPC handler in `src/main.js`:**

- `generate-presskit` - Accept transcription, thumbnail path, return HTML content

### 9. Post-Export Popup UI

**Modify:** `src/renderer/renderer.js`

- In `exportConcatenated()` function, after successful export:
- Show a modal popup asking "Do you want to generate a media press kit?" (Yes/No)
- Store export path for press kit generation

**New UI elements in `src/renderer/index.html`:**

- Press kit generation modal
- Progress indicator for transcription and generation steps
- Error message display

### 10. Press Kit Generation Workflow

**Modify:** `src/renderer/renderer.js`

- Handle "Yes" click from popup:

1. Check if credentials are configured via `check-credentials-configured`
2. If not configured, show Settings modal with message: "Please configure API credentials to use this feature"
3. Only proceed if credentials exist
4. Show progress: "Transcribing video..."
5. Call `transcribe-video` IPC handler
6. Show progress: "Extracting thumbnail..."
7. Call `extract-presskit-thumbnail` IPC handler
8. Show progress: "Generating press kit..."
9. Call `generate-presskit` IPC handler
10. Save HTML file to same directory as exported video with `_presskit.html` suffix
11. Show success message or error if any step fails

### 11. Error Handling

**Error scenarios:**

- API keys not configured → Show settings modal
- Video file moved/deleted → Show error: "Video file no longer exists"
- Transcription fails → Show error: "Failed to transcribe video"
- OpenAI API fails → Show error: "Failed to generate press kit"
- Network errors → Show error with retry option (optional)
- Invalid credentials → Show user-friendly error with option to update settings
- All errors should gracefully stop and show user-friendly message

### 12. HTML Press Kit Template

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

- `src/main/config-manager.js` - Secure credential storage using safeStorage
- `src/main/transcribe-service.js` - AWS Transcribe integration
- `src/main/presskit-generator.js` - OpenAI API integration for press kit generation

**Modified files:**

- `src/main.js` - Add IPC handlers for transcription, press kit generation, and credential management
- `src/renderer/renderer.js` - Add settings modal logic, post-export popup, and press kit generation workflow
- `src/renderer/index.html` - Add Settings button, settings modal, and press kit generation modal
- `src/ffmpeg/wrapper.js` - Add thumbnail extraction function (or new helper)
- `package.json` - Add AWS SDK and OpenAI dependencies

## Testing Considerations

- Test encryption/decryption on Windows
- Verify credentials persist across app restarts
- Test with invalid/missing credentials
- Verify credentials are user-specific (if testing with multiple Windows users)
- Test modal validation and error messages
- Ensure credentials are never logged or exposed in renderer console
- Test with various video lengths (short < 1min, medium 1-5min, long > 5min)
- Test error scenarios (missing API keys, invalid credentials, network failures)
- Verify encrypted storage works correctly
- Test thumbnail extraction from different video formats
- Verify HTML press kit is properly formatted and viewable in browsers
- Ensure existing export functionality remains unaffected