const express = require('express');
const router = express.Router();
const healthCtrl = require('../controllers/healthCtrl');

/**
 * GET /api/health
 * Lightweight ping — returns 200 if service is live.
 * Use this in automation workflows to check if the server is up.
 */
router.get('/', healthCtrl.ping);

/**
 * GET /api/health/deep
 * Full health check — verifies DB, env vars, and tables.
 * Returns 200 on full health, 500 on any failure.
 */
router.get('/deep', healthCtrl.healthCheck);

/**
 * GET /api/health/diagnostic
 * Detailed DB diagnostic — lists per-table status and counts.
 */
router.get('/diagnostic', healthCtrl.dbDiagnostic);

module.exports = router;
