/**
 * translationService.js
 *
 * Translates AI diagnosis result display fields using AWS Translate.
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

const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
require('dotenv').config();

const client = new TranslateClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim()
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Translate a single string from English to the target language.
 * Returns the original string if:
 *  - The text is null / undefined / empty
 *  - The target language is English
 *  - AWS Translate fails (graceful fallback — never crash the response)
 */
const translateText = async (text, targetLang) => {
  if (!text || typeof text !== 'string' || text.trim() === '') return text;
  if (targetLang === 'en') return text;

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: 'en',
      TargetLanguageCode: targetLang
    });
    const result = await client.send(command);
    return result.TranslatedText || text;
  } catch (err) {
    // Graceful fallback: return original English on any error
    console.warn(`⚠️ AWS Translate failed for lang "${targetLang}": ${err.message}`);
    return text;
  }
};

/**
 * Translate an array of strings (e.g. treatment steps).
 * Runs all translations in parallel for speed.
 */
const translateArray = (arr, targetLang) => {
  if (!Array.isArray(arr) || arr.length === 0) return Promise.resolve(arr);
  return Promise.all(arr.map(item => translateText(item, targetLang)));
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Translate all display fields of a diagnosis result.
 *
 * @param {Object} englishResult  - The English AI result from DB / Claude
 * @param {string} targetLang     - BCP-47 language code (e.g. "hi", "es")
 * @returns {Object}              - New object with display fields translated
 */
exports.translateDiagnosisResult = async (englishResult, targetLang) => {
  if (!englishResult || targetLang === 'en') return englishResult;

  console.log(`🌐 Translating diagnosis to "${targetLang}"...`);

  // Run all independent translations in parallel for minimum latency
  const [
    plant_name,
    description,
    disease_name,
    water,
    sun,
    soil,
    fertilizer,
    treatment
  ] = await Promise.all([
    // plant_name: local common name, English as fallback (AWS Translate handles this gracefully)
    translateText(englishResult.plant_name, targetLang),
    translateText(englishResult.description, targetLang),
    // disease_name: display label only — health_status logic always uses the English value
    translateText(englishResult.disease_name, targetLang),
    // care_guide fields (null-safe)
    translateText(englishResult.care_guide?.water, targetLang),
    translateText(englishResult.care_guide?.sun, targetLang),
    translateText(englishResult.care_guide?.soil, targetLang),
    translateText(englishResult.care_guide?.fertilizer, targetLang),
    // treatment steps array
    translateArray(englishResult.treatment, targetLang)
  ]);

  // Build translated result — spread original first to preserve all untouched fields
  const translated = {
    ...englishResult,

    // ✅ Translated display fields
    plant_name,
    description,
    disease_name,
    treatment,

    // ✅ Translated care guide (null-safe)
    care_guide: englishResult.care_guide
      ? { water, sun, soil, fertilizer }
      : null,

    // ❌ NEVER translated — these drive backend logic
    // scientific_name  → always Latin
    // health_status    → "Healthy" / "Sick" / "Unknown" used for DB booleans
    // is_plant         → boolean
    // confidence       → number
    // identification_status → used in DB queries
    // source           → internal flag
  };

  console.log(`✅ Translation to "${targetLang}" complete`);
  return translated;
};
