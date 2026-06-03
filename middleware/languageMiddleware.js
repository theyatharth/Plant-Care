/**
 * languageMiddleware.js
 *
 * Reads the language preference from the request and attaches a validated
 * language code to req.language.
 *
 * Header lookup order (first non-empty value wins):
 *  1. X-App-Language   — recommended header to set in FlutterFlow API calls
 *  2. X-Language       — alternative custom header
 *  3. Accept-Language  — standard HTTP header
 *  4. ?lang=           — query parameter fallback
 *
 * Defaults to 'en' if:
 *  - No header / param is present
 *  - The value is an unsupported language code
 */

// Supported languages matching the FlutterFlow frontend setup
const SUPPORTED_LANGUAGES = [
  'en',  // English
  'hi',  // Hindi
  'gu',  // Gujarati
  'mr',  // Marathi
  'bn',  // Bengali
  'pa',  // Punjabi
  'ta',  // Tamil
  'te',  // Telugu
  'kn',  // Kannada
  'ml'   // Malayalam
];

module.exports = (req, res, next) => {
  // Check headers in priority order — use whichever is set first
  const raw =
    req.headers['x-app-language'] ||
    req.headers['x-language'] ||
    req.headers['accept-language'] ||
    req.query?.lang ||
    'en';

  // Strip region subtags (e.g. "gu-IN" → "gu", "zh-CN" → "zh")
  const lang = raw.split(/[,;\-]/)[0].trim().toLowerCase();

  req.language = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';

  console.log(`🌐 Language resolved: ${req.language} (raw header: "${raw}")`);
  next();
};
