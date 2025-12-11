const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// Load environment variables
require('dotenv').config();

// Debug credentials
console.log('🔧 Bedrock Service Debug:');
console.log('- AWS Access Key:', process.env.AWS_ACCESS_KEY_ID?.substring(0, 8) + '...');
console.log('- AWS Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set (length: ' + process.env.AWS_SECRET_ACCESS_KEY.length + ')' : 'Missing');
console.log('- Region: us-east-1');

// Initialize Client (Always us-east-1 for Cross-Region Inference)
const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
  }
});

const SYSTEM_PROMPT = `
You are an expert botanist. Analyze this plant image.
Return ONLY a JSON object with this structure:
{
  "plant_name": "Common Name",
  "scientific_name": "Scientific Name",
  "description": "Short description",
  "health_status": "Healthy" or "Sick",
  "disease_name": "Disease Name or 'None'",
  "confidence": 0.0 to 1.0,
  "care_guide": { "water": "...", "sun": "..." },
  "treatment": ["step 1", "step 2"]
}
`;

exports.analyzeImage = async (base64Image) => {
  console.log('🔍 Image Analysis Debug:');
  console.log('- Original image length:', base64Image.length);
  console.log('- Image starts with:', base64Image.substring(0, 50));

  // Extract media type from data URI
  let mediaType = "image/jpeg"; // default
  const dataUriMatch = base64Image.match(/^data:image\/(\w+);base64,/);
  if (dataUriMatch) {
    const imageFormat = dataUriMatch[1];
    mediaType = `image/${imageFormat}`;
    console.log('- Detected media type:', mediaType);
  }

  // Sanitize image string
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
  console.log('- Clean base64 length:', cleanBase64.length);

  // Validate base64
  if (!cleanBase64 || cleanBase64.length < 100) {
    throw new Error('Invalid or too small base64 image data');
  }

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: cleanBase64 } },
          { type: "text", text: SYSTEM_PROMPT }
        ]
      }
    ]
  };

  console.log('- Payload media type:', mediaType);
  console.log('- Payload data length:', cleanBase64.length);

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-3-5-sonnet-20240620-v1:0", // US Inference Profile
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload)
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log("Bedrock Response:", JSON.stringify(responseBody, null, 2));

    let rawText = responseBody.content[0].text;

    // Clean markdown if present
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    console.log("Parsed Text:", rawText);

    return JSON.parse(rawText);
  } catch (error) {
    console.error("Bedrock Service Error Details:");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Code:", error.$metadata?.httpStatusCode);
    console.error("Full Error:", JSON.stringify(error, null, 2));
    throw new Error("AI Analysis Failed: " + error.message);
  }
};