const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { applyPlantGuardrails } = require('../services/plantGuardrails');

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
You are a professional botanist and plant pathologist.

CRITICAL RULES (must follow):
- You MUST return ONLY a valid JSON object.
- DO NOT include explanations, headings, markdown, or text outside JSON.
- DO NOT include phrases like "After analyzing"
- DO NOT wrap in \`\`\`.
- If the plant cannot be confidently identified from the image, DO NOT guess.
- Analyze First, Identify Second: Before naming the plant, list the visible features: Leaf shape, Vein pattern, Fruit/Flower type, Branching.
- Reject Ambiguity: If the image is blurry or lacks clear fruit/flowers, return "confidence": 0.5 or lower.
- Confidence Scoring: - 0.95+ requires HD image with MULTIPLE confirming features (Leaves + Fruit + Bark).
- If you only see leaves, max confidence is 0.8.
- Only identify a plant if you are at least 80% confident.
- If confidence is below 0.80, set:
  - plant_name = "Unknown"
  - scientific_name = "Unknown"
  - disease_name = "Unknown"
  - care_guide = null
  - treatment = []
- Confidence must reflect real visual certainty, not assumption.
- Similar-looking plants must not be confused.

Return ONLY valid JSON in this exact structure:

{
  "plant_name": "Common Name or 'Unknown'",
  "scientific_name": "Scientific Name or 'Unknown'",
  "description": "Short factual description or 'Insufficient visual data'",
  "health_status": "Healthy" or "Sick" or "Unknown",
  "disease_name": "Disease Name or 'None' or 'Unknown'",
  "confidence": 0.0 to 1.0,
  "care_guide": { "water": "...", "sun": "..." } or null,
  "treatment": ["step 1", "step 2"]
}
`;


exports.analyzeImage = async (base64Image) => {
  // 1. Sanitize Base64 string
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

  // 2. Detect Media Type (Default to jpeg if unknown)
  let mediaType = "image/jpeg";
  const match = base64Image.match(/^data:(image\/\w+);base64,/);
  if (match) mediaType = match[1];

  // 3. Construct Payload (CORRECTED STRUCTURE)
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
    temperature: 0.1, // Low temp for factual/strict JSON

    // FIX: System prompt goes HERE, not inside messages
    system: SYSTEM_PROMPT,

    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: cleanBase64
            }
          },
          {
            type: "text",
            text: "Analyze this plant image and provide the diagnosis JSON."
          }
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

    const parsed = JSON.parse(rawText);
    return applyPlantGuardrails(parsed);
  } catch (error) {
    console.error("Bedrock Service Error Details:");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Code:", error.$metadata?.httpStatusCode);
    console.error("Full Error:", JSON.stringify(error, null, 2));
    throw new Error("AI Analysis Failed: " + error.message);
  }
};