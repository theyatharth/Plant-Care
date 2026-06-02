/**
 * languageMiddleware.js
 *
 * Reads the Accept-Language header from every request and attaches a
 * validated language code to req.language.
 *
 * Defaults to 'en' for:
 *  - Missing header
 *  - Unsupported language codes
 */

const SUPPORTED_LANGUAGES = ['en', 'hi', 'es', 'fr', 'pt', 'de', 'ja', 'zh', 'ar', 'ta'];

module.exports = (req, res, next) => {
  // Accept-Language can be "hi,en-US;q=0.9" — we only care about the primary tag
  const rawLang = req.headers['accept-language']?.split(',')[0]?.trim() || 'en';

  // Strip region subtags (e.g. "zh-CN" → "zh", "pt-BR" → "pt")
  const lang = rawLang.split('-')[0].toLowerCase();

  req.language = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';

  console.log(`🌐 Language resolved: ${req.language} (raw: "${rawLang}")`);
  next();
};
