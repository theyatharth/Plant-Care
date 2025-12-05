const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// Initialize Client (Always us-east-1 for Cross-Region Inference)
const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
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
  // Sanitize image string
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: cleanBase64 } },
          { type: "text", text: SYSTEM_PROMPT }
        ]
      }
    ]
  };

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-3-5-sonnet-20240620-v1:0", // US Inference Profile
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload)
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    let rawText = responseBody.content[0].text;

    // Clean markdown if present
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(rawText);
  } catch (error) {
    console.error("Bedrock Service Error:", error);
    throw new Error("AI Analysis Failed");
  }
};