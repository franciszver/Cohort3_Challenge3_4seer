const { StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscribeClient } = require('@aws-sdk/client-transcribe');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getFFmpegPath } = require('../ffmpeg/wrapper');

/**
 * Extract audio from video file using FFmpeg
 */
async function extractAudio(videoPath) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(require('os').tmpdir(), 'transcribe_audio_' + Date.now());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const audioPath = path.join(tempDir, 'audio.wav');
    const ffmpegPath = getFFmpegPath();
    
    const args = [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', 'pcm_s16le', // WAV format
      '-ar', '44100', // Sample rate
      '-ac', '2', // Stereo
      '-y', // Overwrite
      audioPath
    ];
    
    // Hide terminal window on Windows, suppress output for background processing
    const proc = spawn(ffmpegPath, args, { 
      stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr for error messages
      windowsHide: true // Hide terminal window on Windows
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ audioPath, tempDir });
      } else {
        reject(new Error('FFmpeg exited with code ' + code));
      }
    });
    proc.on('error', reject);
  });
}

/**
 * Upload audio file to S3
 */
async function uploadAudioToS3(audioPath, bucketName, key, credentials) {
  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  });
  
  const fileContent = fs.readFileSync(audioPath);
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
    ContentType: 'audio/wav'
  });
  
  await client.send(command);
  return `s3://${bucketName}/${key}`;
}

/**
 * Start transcription job
 */
async function startTranscriptionJob(mediaUri, credentials, languageCode = 'en-US') {
  const client = new TranscribeClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  });
  
  const jobName = `transcribe-${Date.now()}`;
  
  // Extract bucket name from media URI (s3://bucket-name/key)
  const bucketName = mediaUri.split('/')[2];
  
  const command = new StartTranscriptionJobCommand({
    TranscriptionJobName: jobName,
    Media: { MediaFileUri: mediaUri },
    MediaFormat: 'wav',
    LanguageCode: languageCode,
    OutputBucketName: bucketName // Store transcript in the same bucket as the audio
    // Settings removed - MaxAlternatives must be >= 2 if specified, so we'll use defaults
  });
  
  await client.send(command);
  return jobName;
}

/**
 * Poll for transcription job completion
 */
async function waitForTranscriptionJob(jobName, credentials, maxWaitTime = 300000) { // 5 minutes max
  const client = new TranscribeClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  });
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const command = new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName
    });
    
    const response = await client.send(command);
    const job = response.TranscriptionJob;
    
    if (job.TranscriptionJobStatus === 'COMPLETED') {
      // Download transcript from S3
      // AWS Transcribe stores the transcript JSON in the same bucket as the input media
      const transcriptUri = job.Transcript.TranscriptFileUri;
      // Parse S3 URI from transcript file URI
      // Format: https://s3.region.amazonaws.com/bucket-name/key or https://bucket-name.s3.region.amazonaws.com/key
      const url = new URL(transcriptUri);
      let transcriptBucketName, transcriptKey;
      
      // Handle both URL formats
      if (url.hostname.includes('.s3.')) {
        // Format: bucket-name.s3.region.amazonaws.com
        transcriptBucketName = url.hostname.split('.')[0];
        transcriptKey = url.pathname.substring(1);
      } else {
        // Format: s3.region.amazonaws.com/bucket-name/key
        const pathParts = url.pathname.split('/').filter(p => p);
        transcriptBucketName = pathParts[0];
        transcriptKey = pathParts.slice(1).join('/');
      }
      
      // Download transcript JSON
      const s3Client = new S3Client({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      });
      const getCommand = new GetObjectCommand({ Bucket: transcriptBucketName, Key: transcriptKey });
      const transcriptResponse = await s3Client.send(getCommand);
      const transcriptData = JSON.parse(await transcriptResponse.Body.transformToString());
      
      // Extract transcript text
      const transcriptText = transcriptData.results.transcripts[0].transcript;
      
      return transcriptText;
    } else if (job.TranscriptionJobStatus === 'FAILED') {
      throw new Error(`Transcription job failed: ${job.FailureReason}`);
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
  }
  
  throw new Error('Transcription job timed out');
}

/**
 * Transcribe video using AWS Transcribe
 * Note: Requires an S3 bucket to be configured. The bucket name should be provided or use a default.
 */
async function transcribeVideo(videoPath, credentials, bucketName = null) {
  let audioPath, tempDir;
  
  // Use provided bucket or default (user should configure this in settings)
  const s3BucketName = bucketName || '4seer-transcribe-temp';
  
  try {
    // Extract audio from video
    const audioResult = await extractAudio(videoPath);
    audioPath = audioResult.audioPath;
    tempDir = audioResult.tempDir;
    
    // Upload to S3
    const key = `audio-${Date.now()}.wav`;
    const s3Uri = await uploadAudioToS3(audioPath, s3BucketName, key, credentials);
    
    // Start transcription job
    const jobName = await startTranscriptionJob(s3Uri, credentials);
    
    // Wait for completion
    const transcript = await waitForTranscriptionJob(jobName, credentials);
    
    // Cleanup: delete audio from S3
    try {
      const s3Client = new S3Client({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      });
      const deleteCommand = new DeleteObjectCommand({ Bucket: s3BucketName, Key: key });
      await s3Client.send(deleteCommand);
    } catch (err) {
      console.warn('Failed to cleanup S3 audio file:', err);
    }
    
    // Cleanup temp files
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('Failed to cleanup temp directory:', err);
    }
    
    return transcript;
  } catch (err) {
    // Cleanup on error
    try {
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }
    
    throw err;
  }
}

module.exports = { transcribeVideo };

