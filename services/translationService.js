/**
 * translationService.js
 *
 * Translates AI diagnosis result display fields using Claude Haiku via AWS Bedrock.
 *
 * Why Haiku (not Sonnet)?
 *  - Already authorized — same Bedrock credentials, no new IAM permissions needed
 *  - ~20x cheaper than Sonnet for simple translation tasks
 *  - Single batched Claude call = faster than 11 parallel AWS Translate calls
 *  - Fluent in all supported languages, excellent with plant/botanical terminology
 *
 * RULES:
 *  - ai_raw_response in DB is ALWAYS English. This service only translates
 *    for the API *response* (or on-demand for old scans).
 *  - Fields that ARE translated (display only):
 *      plant_name, description, disease_name,
 *      care_guide.{ water, sun, soil, fertilizer },
 *      treatment[]
 *  - Fields that are NEVER translated (logic / scientific):
 *      scientific_name, health_status, is_plant, confidence,
 *      identification_status, source
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

const client = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
  }
});

// Language code → full name for the Claude prompt
const LANGUAGE_NAMES = {
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
  ta: 'Tamil'
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Translate all display fields of a diagnosis result using Claude Haiku.
 * Makes a single Bedrock call — all fields batched into one JSON translation request.
 *
 * @param {Object} englishResult  - The English AI result from DB / Claude
 * @param {string} targetLang     - BCP-47 language code (e.g. "hi", "es")
 * @returns {Object}              - New object with display fields translated
 */
exports.translateDiagnosisResult = async (englishResult, targetLang) => {
  if (!englishResult || targetLang === 'en') return englishResult;

  const languageName = LANGUAGE_NAMES[targetLang] || targetLang;
  console.log(`🌐 Translating diagnosis to ${languageName} ("${targetLang}") via Claude Haiku...`);

  // ── Build compact payload — only translatable, non-null fields ──────────────
  const toTranslate = {
    plant_name:   englishResult.plant_name   || null,
    description:  englishResult.description  || null,
    disease_name: englishResult.disease_name || null,
    care_guide: englishResult.care_guide ? {
      water:      englishResult.care_guide.water      || null,
      sun:        englishResult.care_guide.sun        || null,
      soil:       englishResult.care_guide.soil       || null,
      fertilizer: englishResult.care_guide.fertilizer || null
    } : null,
    treatment: (Array.isArray(englishResult.treatment) && englishResult.treatment.length > 0)
      ? englishResult.treatment
      : null
  };

  const prompt = `Translate this JSON from English to ${languageName}.

RULES (follow exactly):
- Return ONLY valid JSON. No explanation, no markdown, no code fences.
- Translate all string values to ${languageName}.
- For plant_name: use the well-known ${languageName} common name if it exists; otherwise keep the English name.
- Keep null as null — do not translate null values.
- Keep arrays as arrays — translate each string element.
- Do not add, rename, or remove any JSON keys.

JSON to translate:
${JSON.stringify(toTranslate, null, 2)}`;

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1500,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }]
  };

  try {
    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    });

    const response = await client.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));

    let rawText = body.content[0].text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const translatedFields = JSON.parse(rawText);

    // ── Merge translated display fields back, preserving all original fields ──
    const translated = {
      ...englishResult,

      // ✅ Translated display fields (fall back to English if translation returned null)
      plant_name:   translatedFields.plant_name   || englishResult.plant_name,
      description:  translatedFields.description  || englishResult.description,
      disease_name: translatedFields.disease_name || englishResult.disease_name,
      treatment:    translatedFields.treatment    || englishResult.treatment,

      // ✅ Translated care guide (null-safe)
      care_guide: englishResult.care_guide ? {
        water:      translatedFields.care_guide?.water      || englishResult.care_guide.water,
        sun:        translatedFields.care_guide?.sun        || englishResult.care_guide.sun,
        soil:       translatedFields.care_guide?.soil       || englishResult.care_guide.soil,
        fertilizer: translatedFields.care_guide?.fertilizer || englishResult.care_guide.fertilizer
      } : null,

      // ❌ NEVER translated — backend logic depends on these being English
      // scientific_name     → always Latin
      // health_status       → "Healthy" / "Sick" / "Unknown" — used for is_healthy DB column
      // is_plant            → boolean
      // confidence          → number
      // identification_status → used in DB queries
      // source              → internal flag
    };

    console.log(`✅ Translation to ${languageName} complete`);
    return translated;

  } catch (err) {
    // Graceful fallback — return English. API never crashes due to translation failure.
    console.error(`❌ Translation to "${targetLang}" failed: ${err.message}`);
    console.error('   Falling back to English result.');
    return englishResult;
  }
};
