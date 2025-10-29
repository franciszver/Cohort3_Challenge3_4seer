const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

/**
 * Generate HTML press kit from transcription using OpenAI
 */
async function generatePressKit(transcription, thumbnailPath, openaiKey) {
  const openai = new OpenAI({ apiKey: openaiKey });
  
  // Build prompt for OpenAI
  const prompt = `Based on the following video transcription, generate a professional press kit in HTML format. The press kit should include:

1. Product/Service Name (inferred from content)
2. Overview paragraph (2-3 sentences summarizing what this is about)
3. Elevator Pitch (one compelling sentence)
4. Key Features (bullet points, 4-6 items)
5. Use Cases (2-3 scenarios where this would be useful)
6. Tech Stack (technologies mentioned or inferred)
7. Demo Highlights (key points from the transcription)
8. Founder/Team Quote (synthesize a professional quote that captures the essence)
9. Social Media Content:
   - Twitter/X post (280 characters)
   - Instagram caption (with relevant hashtags)
   - LinkedIn post (professional tone)
   - TikTok description (engaging, short)
10. Press Contact (generic: press@company.com or similar)

Format the response as a complete, standalone HTML document with:
- Modern, professional design
- Dark theme with good contrast
- Responsive layout
- Embedded thumbnail image (use base64 or relative path)
- Proper typography
- Clean, readable styling

Here is the transcription:
${transcription}

Generate the complete HTML press kit now:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency, can switch to gpt-4 if needed
      messages: [
        {
          role: 'system',
          content: 'You are a professional copywriter specializing in creating press kits and marketing materials. Generate comprehensive, well-formatted HTML press kits based on video transcriptions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.7
    });
    
    let htmlContent = response.choices[0].message.content;
    
    // If the response includes markdown code blocks, extract the HTML
    if (htmlContent.includes('```html')) {
      const match = htmlContent.match(/```html\n([\s\S]*?)\n```/);
      if (match) {
        htmlContent = match[1];
      }
    } else if (htmlContent.includes('```')) {
      // Handle other code block formats
      const match = htmlContent.match(/```\n([\s\S]*?)\n```/);
      if (match) {
        htmlContent = match[1];
      }
    }
    
    // Embed thumbnail if provided
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      const thumbnailBuffer = fs.readFileSync(thumbnailPath);
      const thumbnailBase64 = thumbnailBuffer.toString('base64');
      const thumbnailMime = path.extname(thumbnailPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      
      // Find where to insert the thumbnail (look for <img> tag or add in a dedicated section)
      if (!htmlContent.includes('<img') && !htmlContent.includes('thumbnail')) {
        // Add thumbnail section near the top
        const bodyMatch = htmlContent.match(/<body[^>]*>/i);
        if (bodyMatch) {
          const insertPos = bodyMatch.index + bodyMatch[0].length;
          const thumbnailHtml = `
    <div class="thumbnail-container" style="text-align: center; margin: 20px 0;">
      <img src="data:${thumbnailMime};base64,${thumbnailBase64}" alt="Video Thumbnail" style="max-width: 100%; height: auto; border-radius: 8px;" />
    </div>`;
          htmlContent = htmlContent.slice(0, insertPos) + thumbnailHtml + htmlContent.slice(insertPos);
        }
      } else {
        // Replace existing img src or add base64 to existing img
        htmlContent = htmlContent.replace(
          /(<img[^>]*src=["'])([^"']*)(["'][^>]*>)/i,
          `$1data:${thumbnailMime};base64,${thumbnailBase64}$3`
        );
      }
    }
    
    // Ensure proper HTML structure if missing
    if (!htmlContent.includes('<!DOCTYPE') && !htmlContent.includes('<html')) {
      htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Press Kit</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    h1, h2, h3 {
      color: #ffffff;
    }
    h1 {
      border-bottom: 2px solid #4a9eff;
      padding-bottom: 10px;
    }
    .section {
      margin: 30px 0;
      padding: 20px;
      background: #2a2a2a;
      border-radius: 8px;
    }
    ul {
      padding-left: 20px;
    }
    blockquote {
      border-left: 4px solid #4a9eff;
      padding-left: 20px;
      margin: 20px 0;
      font-style: italic;
      color: #b0b0b0;
    }
    .social-media {
      background: #333;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
    }
    
    return htmlContent;
  } catch (err) {
    console.error('Error generating press kit:', err);
    throw new Error(`Failed to generate press kit: ${err.message}`);
  }
}

module.exports = { generatePressKit };

