/**
 * test_multilingual_api.js
 *
 * End-to-end API tests for the multilingual workflow.
 * Starts the server internally, generates a real JWT, and runs all test paths.
 *
 * Tests covered:
 *   1. Language middleware — correct header parsing + fallback to "en"
 *   2. getScanById cache miss → needs_translation flag
 *   3. translateScan (POST /scan/:id/translate) → translates + caches in DB
 *   4. getScanById cache HIT → serves cached Hindi result
 *   5. Verify ai_raw_response in DB is STILL English after all operations
 *   6. New scan endpoint returns translated result (Accept-Language: hi)
 *      [optional — only if you have a real plant image to test with]
 *
 * Run: node test_multilingual_api.js
 */

require('dotenv').config();
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('./configure/dbConfig');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = 3099; // separate port so it doesn't clash with your running server
const BASE = `http://localhost:${PORT}/api/plants`;

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, condition, actual = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (actual !== '') console.log(`     Got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  📋 ${title}`);
  console.log('─'.repeat(55));
}

// ── Generate a real JWT from first user in DB ─────────────────────────────────
async function getTestToken() {
  const result = await db.query('SELECT id, email FROM users LIMIT 1');
  if (!result.rows.length) throw new Error('No users in DB — cannot generate token');
  const { id, email } = result.rows[0];
  const token = jwt.sign({ userId: id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  console.log(`\n🔑 Test user: ${email} (id: ${id})`);
  return { token, userId: id };
}

// ── Get a real existing scan ID from DB ───────────────────────────────────────
async function getTestScanId(userId) {
  const result = await db.query(
    `SELECT id FROM scans WHERE user_id = $1
     AND ai_raw_response->>'is_plant' != 'false'
     AND confidence > 0
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!result.rows.length) return null;
  return result.rows[0].id;
}

// ── Reset translated_responses for a scan (clean slate for test) ──────────────
async function clearTranslationCache(scanId) {
  await db.query(
    `UPDATE scans SET translated_responses = '{}' WHERE id = $1`,
    [scanId]
  );
}

// ── Read raw DB state for verification ───────────────────────────────────────
async function getDbState(scanId) {
  const result = await db.query(
    `SELECT ai_raw_response, translated_responses FROM scans WHERE id = $1`,
    [scanId]
  );
  return result.rows[0];
}

// ── Start a minimal Express server on test port ───────────────────────────────
function startTestServer() {
  return new Promise((resolve) => {
    const app = require('./index_test_shim');  // see below
    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`\n🚀 Test server started on port ${PORT}`);
      resolve(server);
    });
  });
}

// ── Main test runner ──────────────────────────────────────────────────────────
async function runTests() {
  console.log('='.repeat(55));
  console.log('  Multilingual API — End-to-End Tests');
  console.log('='.repeat(55));

  // ── Setup ──────────────────────────────────────────────────────────────────
  let server;
  try {
    const express = require('express');
    const app = express();
    app.use(require('cors')());
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/plants', require('./middleware/languageMiddleware'), require('./routes/plantRoutes'));
    server = http.createServer(app);
    await new Promise(r => server.listen(PORT, r));
    console.log(`\n🚀 Test server on port ${PORT}`);
  } catch (e) {
    console.error('❌ Could not start test server:', e.message);
    process.exit(1);
  }

  const { token, userId } = await getTestToken();
  const AUTH = { Authorization: `Bearer ${token}` };

  const scanId = await getTestScanId(userId);
  if (!scanId) {
    console.log('\n⚠️  No existing scans found for this user. Tests 2-5 will be skipped.');
    console.log('   Scan a plant first, then re-run this test.');
  } else {
    console.log(`\n📄 Using existing scan ID: ${scanId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST GROUP 1 — Language Middleware
  // ═══════════════════════════════════════════════════════════════════════════
  section('Language Middleware');

  // We test middleware by hitting getScanById (a lightweight, read-only endpoint)
  // and observing the needs_translation flag — which only appears when req.language != 'en'

  if (scanId) {
    // 1a. No header → should behave as English (needs_translation: false or absent)
    try {
      const r = await axios.get(`${BASE}/scan/${scanId}`, { headers: AUTH });
      check('No Accept-Language header → no needs_translation flag',
        !r.data.scan?.needs_translation);
    } catch (e) {
      check('No Accept-Language header request succeeded', false, e.message);
    }

    // 1b. Accept-Language: hi → needs_translation: true (cache was just cleared above if scanId exists)
    await clearTranslationCache(scanId);
    try {
      const r = await axios.get(`${BASE}/scan/${scanId}`, {
        headers: { ...AUTH, 'Accept-Language': 'hi' }
      });
      check('Accept-Language: hi → needs_translation: true',
        r.data.scan?.needs_translation === true, r.data.scan?.needs_translation);
    } catch (e) {
      check('Accept-Language: hi request succeeded', false, e.message);
    }

    // 1c. Accept-Language: xx-UNSUPPORTED → falls back to English
    try {
      const r = await axios.get(`${BASE}/scan/${scanId}`, {
        headers: { ...AUTH, 'Accept-Language': 'zz-INVALID' }
      });
      check('Unsupported lang "zz-INVALID" → falls back to English (no needs_translation)',
        !r.data.scan?.needs_translation);
    } catch (e) {
      check('Unsupported lang request succeeded', false, e.message);
    }

    // 1d. Accept-Language: zh-CN → region tag stripped → "zh" accepted
    await clearTranslationCache(scanId);
    try {
      const r = await axios.get(`${BASE}/scan/${scanId}`, {
        headers: { ...AUTH, 'Accept-Language': 'zh-CN' }
      });
      check('Accept-Language: zh-CN → region stripped → treated as "zh"',
        r.data.scan?.needs_translation === true);
    } catch (e) {
      check('zh-CN region-strip request succeeded', false, e.message);
    }
  } else {
    console.log('  ⚠️  Skipped (no scan available)');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST GROUP 2 — translateScan Endpoint (cache miss → translate → cache)
  // ═══════════════════════════════════════════════════════════════════════════
  section('POST /scan/:id/translate — On-Demand Translation');

  if (scanId) {
    // Clear cache to guarantee a miss
    await clearTranslationCache(scanId);

    let translatedData;
    try {
      const r = await axios.post(`${BASE}/scan/${scanId}/translate`, {}, {
        headers: { ...AUTH, 'Accept-Language': 'hi' }
      });
      translatedData = r.data;

      check('Response success: true', r.data.success === true, r.data.success);
      check('Response language: "hi"', r.data.language === 'hi', r.data.language);
      check('fromCache: false (first translation)', r.data.fromCache === false, r.data.fromCache);
      check('data.plant_name present', !!r.data.data?.plant_name, r.data.data?.plant_name);
      check('data.description present', !!r.data.data?.description);
      check('data.care_guide present', !!r.data.data?.care_guide);
      check('data.treatment is array', Array.isArray(r.data.data?.treatment));

      // ── Critical: logic fields must be English in the translated response ──
      check('health_status is English in response ("Healthy"/"Sick"/"Unknown")',
        ['Healthy', 'Sick', 'Unknown'].includes(r.data.data?.health_status),
        r.data.data?.health_status);

      console.log('\n  📝 Sample Hindi values returned:');
      console.log('    plant_name: ', r.data.data?.plant_name);
      console.log('    disease_name:', r.data.data?.disease_name);
      console.log('    treatment[0]:', r.data.data?.treatment?.[0]?.substring(0, 60) + '...');

    } catch (e) {
      check('translateScan request succeeded', false, e.response?.data || e.message);
    }

    // ── Verify DB state AFTER translate ───────────────────────────────────────
    section('DB Integrity Check — After translateScan');
    const dbState = await getDbState(scanId);

    check('ai_raw_response still has English health_status',
      ['Healthy', 'Sick', 'Unknown', 'healthy', 'sick', 'unknown']
        .some(v => dbState?.ai_raw_response?.health_status?.includes(v)),
      dbState?.ai_raw_response?.health_status);

    check('translated_responses["hi"] is now populated in DB',
      !!dbState?.translated_responses?.hi, dbState?.translated_responses);

    check('ai_raw_response.plant_name is still English',
      // it should not contain Devanagari script characters (Hindi)
      !/[\u0900-\u097F]/.test(dbState?.ai_raw_response?.plant_name || ''),
      dbState?.ai_raw_response?.plant_name);

  } else {
    console.log('  ⚠️  Skipped (no scan available)');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST GROUP 3 — getScanById Cache HIT
  // ═══════════════════════════════════════════════════════════════════════════
  section('GET /scan/:id — Cache HIT (second request in Hindi)');

  if (scanId) {
    try {
      const r = await axios.get(`${BASE}/scan/${scanId}`, {
        headers: { ...AUTH, 'Accept-Language': 'hi' }
      });

      check('Request succeeded (200)', r.status === 200, r.status);
      check('needs_translation flag is ABSENT (cache hit)',
        r.data.scan?.needs_translation !== true, r.data.scan?.needs_translation);
      check('translationCached: true returned',
        r.data.scan?.translationCached === true, r.data.scan?.translationCached);
      check('scientificName is still Latin/English',
        !!r.data.scan?.scientificName && !/[\u0900-\u097F]/.test(r.data.scan?.scientificName),
        r.data.scan?.scientificName);
      check('healthStatus is still English',
        ['Healthy', 'Sick', 'Unknown'].includes(r.data.scan?.healthStatus),
        r.data.scan?.healthStatus);

    } catch (e) {
      check('Cache hit request succeeded', false, e.response?.data || e.message);
    }

    // ── Second call to translateScan should now be fromCache: true ────────────
    section('POST /scan/:id/translate — Cache HIT (no AWS call)');
    try {
      const r = await axios.post(`${BASE}/scan/${scanId}/translate`, {}, {
        headers: { ...AUTH, 'Accept-Language': 'hi' }
      });
      check('fromCache: true on second translate call', r.data.fromCache === true, r.data.fromCache);
      check('Same data returned from cache', !!r.data.data?.plant_name);
    } catch (e) {
      check('Second translateScan request succeeded', false, e.message);
    }
  } else {
    console.log('  ⚠️  Skipped (no scan available)');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST GROUP 4 — Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════
  section('Edge Cases');

  if (scanId) {
    // Translate to English should return 400
    try {
      await axios.post(`${BASE}/scan/${scanId}/translate`, {}, {
        headers: { ...AUTH, 'Accept-Language': 'en' }
      });
      check('Translating to "en" returns 400', false, 'Expected 400 but got 200');
    } catch (e) {
      check('Translating to "en" returns 400', e.response?.status === 400, e.response?.status);
    }

    // Wrong scan ID returns 404
    try {
      await axios.post(`${BASE}/scan/99999999/translate`, {}, {
        headers: { ...AUTH, 'Accept-Language': 'hi' }
      });
      check('Non-existent scan returns 404', false, 'Expected 404 but got 200');
    } catch (e) {
      check('Non-existent scan returns 404', e.response?.status === 404, e.response?.status);
    }
  } else {
    console.log('  ⚠️  Skipped (no scan available)');
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉 All tests PASSED — multilingual workflow is working!');
  } else {
    console.log('  ⚠️  Some tests failed. Review output above.');
  }
  console.log('='.repeat(55) + '\n');

  server.close();
  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('\n❌ Fatal test error:', e.message);
  process.exit(1);
});
