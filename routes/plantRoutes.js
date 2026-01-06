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

module.exports = router;