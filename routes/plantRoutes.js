const express = require('express');
const router = express.Router();
const plantCtrl = require('../controllers/plantCtrl');
const { verifyToken } = require('../middleware/authMiddleware');

// All plant scan routes require authentication
router.post('/scan', verifyToken, plantCtrl.scanPlant);
router.get('/history', verifyToken, plantCtrl.getHistory);
router.get('/scan/:scanId', verifyToken, plantCtrl.getScanById);

// Discord community sharing
router.post('/share-discord', verifyToken, plantCtrl.shareToDiscord);

// User Feedback to Scan Result
router.post('/scan/:scanId/feedback', verifyToken, plantCtrl.submitScanFeedback);

// Plant Net API Calling (correction path)
router.post('/scan/:scanId/correct', verifyToken, plantCtrl.handleDislikeWithCorrection);

// On-demand translation for old scans (called from FlutterFlow "Translate" button)
router.post('/scan/:scanId/translate', verifyToken, plantCtrl.translateScan);


module.exports = router;