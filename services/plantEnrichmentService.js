const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
require("dotenv").config();

const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const ENRICHMENT_SYSTEM_PROMPT = `
You are a professional plant pathologist.

IMPORTANT CONTEXT:
- The plant species is already identified.
- You MUST NOT identify or guess the plant species again.

MANDATORY ANALYSIS ORDER:
1. First analyze visible symptoms ONLY from the image:
   - leaf spots
   - discoloration
   - mold / fungal growth
   - lesions / rust / wilting
2. Then infer the MOST LIKELY disease consistent with:
   - visible symptoms
   - known diseases of this species
3. If symptoms are visible but disease is uncertain, still provide
   the most probable disease with conservative confidence.

STRICT RULES:
- Return ONLY valid JSON.
- Do NOT restate plant identification.
- Do NOT say "cannot determine" if symptoms are clearly visible.
- If no visible symptoms exist, set health_status = "Healthy".

CARE RULES:
- Care guide MUST be species-specific.
- Treatment MUST be actionable and realistic for home gardeners.
- Avoid dangerous chemicals unless clearly necessary.

Return ONLY JSON in this exact structure:

{
  "health_status": "Healthy" or "Sick" or "Unknown",
  "disease_name": "Disease Name" or "None" or "Unknown",
  "description": "Short factual symptom-based explanation",
  "care_guide": {
    "water": "...",
    "sun": "...",
    "soil": "...",
    "fertilizer": "..."
  },
  "treatment": ["step 1", "step 2"]
}
`;

exports.enrichPlantData = async ({ scientific_name, common_name, confidence }, base64Image = null) => {
  const messages = [];

  // Optional image for symptom inspection
  if (base64Image) {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const mediaType =
      base64Image.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";

    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: cleanBase64
          }
        }
      ]
    });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `
Plant scientific name: ${scientific_name}
Common name: ${common_name}
Identification confidence: ${confidence}

Analyze ONLY health, disease, treatment, and care.
        `.trim()
      }
    ]
  });

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1200,
    temperature: 0.1,
    system: ENRICHMENT_SYSTEM_PROMPT,
    messages
  };

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-3-5-sonnet-20240620-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload)
  });

  try {
    const response = await client.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));

    let text = body.content[0].text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(text);
  } catch (err) {
    console.error("❌ Plant enrichment failed:", err.message);
    throw new Error("Plant enrichment failed");
  }
};
