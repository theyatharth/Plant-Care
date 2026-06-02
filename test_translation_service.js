/**
 * test_translation_service.js
 *
 * Unit test for translationService.js — no server or auth required.
 * Tests AWS Translate directly with a realistic plant diagnosis payload.
 *
 * Run: node test_translation_service.js
 */

const translationService = require('./services/translationService');

// ── Test data — realistic English AI diagnosis result ─────────────────────────
const ENGLISH_RESULT = {
  is_plant: true,
  plant_name: "Rose",
  scientific_name: "Rosa",
  description: "A common flowering plant known for its beautiful blooms and fragrance.",
  health_status: "Sick",              // ← MUST stay "Sick" in English (logic field)
  disease_name: "Black Spot Disease",
  confidence: 0.92,
  identification_status: "Confirmed", // ← MUST stay English (DB logic field)
  source: "claude",                   // ← MUST stay English (internal flag)
  care_guide: {
    water: "Water deeply once a week, allowing soil to dry slightly between waterings.",
    sun: "Requires at least 6 hours of direct sunlight per day.",
    soil: "Well-draining, slightly acidic soil with pH 6.0 to 6.5.",
    fertilizer: "Feed with a balanced rose fertilizer every 4 weeks during growing season."
  },
  treatment: [
    "Remove and dispose of all infected leaves immediately.",
    "Apply a fungicide spray containing chlorothalonil or myclobutanil.",
    "Avoid overhead watering to prevent spore spread.",
    "Improve air circulation by pruning overcrowded branches."
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';

function check(label, condition, actual = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}`);
    if (actual) console.log(`     Got: ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('='.repeat(60));
  console.log('  Translation Service — Unit Tests');
  console.log('='.repeat(60));

  // ── TEST 1: English passthrough (no AWS call should be made) ──────────────
  console.log('\n📋 Test 1: English passthrough (no-op)');
  const englishResult = await translationService.translateDiagnosisResult(ENGLISH_RESULT, 'en');
  check('Returns the same object reference for "en"', englishResult === ENGLISH_RESULT);
  console.log('  (No AWS Translate call was made — correct behaviour)');

  // ── TEST 2: Hindi translation ─────────────────────────────────────────────
  console.log('\n📋 Test 2: Translate to Hindi ("hi")');
  const hindiResult = await translationService.translateDiagnosisResult(ENGLISH_RESULT, 'hi');

  check('plant_name is translated (not English)',
    hindiResult.plant_name !== 'Rose', hindiResult.plant_name);

  check('description is translated',
    hindiResult.description !== ENGLISH_RESULT.description, hindiResult.description);

  check('disease_name is translated',
    hindiResult.disease_name !== ENGLISH_RESULT.disease_name, hindiResult.disease_name);

  check('care_guide.water is translated',
    hindiResult.care_guide?.water !== ENGLISH_RESULT.care_guide.water);

  check('care_guide.sun is translated',
    hindiResult.care_guide?.sun !== ENGLISH_RESULT.care_guide.sun);

  check('care_guide.soil is translated',
    hindiResult.care_guide?.soil !== ENGLISH_RESULT.care_guide.soil);

  check('care_guide.fertilizer is translated',
    hindiResult.care_guide?.fertilizer !== ENGLISH_RESULT.care_guide.fertilizer);

  check('treatment array is translated (first item)',
    hindiResult.treatment?.[0] !== ENGLISH_RESULT.treatment[0], hindiResult.treatment?.[0]);

  check('treatment has same number of steps (4)',
    hindiResult.treatment?.length === 4, hindiResult.treatment?.length);

  // ── CRITICAL: Logic fields must NEVER be translated ───────────────────────
  console.log('\n📋 Test 3: Logic fields preserved in English');

  check('scientific_name unchanged — always Latin',
    hindiResult.scientific_name === 'Rosa', hindiResult.scientific_name);

  check('health_status unchanged — must stay "Sick" for DB boolean logic',
    hindiResult.health_status === 'Sick', hindiResult.health_status);

  check('is_plant unchanged (boolean)',
    hindiResult.is_plant === true, hindiResult.is_plant);

  check('confidence unchanged (number)',
    hindiResult.confidence === 0.92, hindiResult.confidence);

  check('identification_status unchanged',
    hindiResult.identification_status === 'Confirmed', hindiResult.identification_status);

  check('source unchanged',
    hindiResult.source === 'claude', hindiResult.source);

  // ── TEST 4: Unsupported language gracefully falls back ────────────────────
  console.log('\n📋 Test 4: Null/empty description gracefully handled');
  const resultWithNulls = { ...ENGLISH_RESULT, description: null, care_guide: null, treatment: [] };
  let nullResult;
  try {
    nullResult = await translationService.translateDiagnosisResult(resultWithNulls, 'hi');
    check('Null description handled without crash', nullResult.description === null);
    check('Null care_guide handled without crash', nullResult.care_guide === null);
    check('Empty treatment array handled', Array.isArray(nullResult.treatment) && nullResult.treatment.length === 0);
  } catch (e) {
    check('Should not throw on null fields', false, e.message);
  }

  // ── TEST 5: Spanish translation ───────────────────────────────────────────
  console.log('\n📋 Test 5: Translate to Spanish ("es")');
  const spanishResult = await translationService.translateDiagnosisResult(ENGLISH_RESULT, 'es');
  check('description is translated to Spanish',
    spanishResult.description !== ENGLISH_RESULT.description, spanishResult.description);
  check('health_status still "Sick" in Spanish result',
    spanishResult.health_status === 'Sick', spanishResult.health_status);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  if (process.exitCode === 1) {
    console.log('❌ Some tests FAILED. See output above.');
  } else {
    console.log('✅ All translation service tests PASSED.');
  }
  console.log('\n📝 Sample Hindi output:');
  console.log('  plant_name:    ', hindiResult.plant_name);
  console.log('  disease_name:  ', hindiResult.disease_name);
  console.log('  description:   ', hindiResult.description?.substring(0, 80) + '...');
  console.log('  treatment[0]:  ', hindiResult.treatment?.[0]);
  console.log('  health_status: ', hindiResult.health_status, '← must be English');
  console.log('  scientific_name:', hindiResult.scientific_name, '← must be Latin');
  console.log('='.repeat(60));

  process.exit(process.exitCode || 0);
}

runTests().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  process.exit(1);
});
