const express = require('express');
const router = express.Router();
const discordCtrl = require('../controllers/discordCtrl');
const { verifyToken } = require('../middleware/authMiddleware');

// Discord OAuth2 authentication routes
router.get('/auth/initiate', verifyToken, discordCtrl.initiateAuth);
router.get('/auth/callback', discordCtrl.handleCallback); // No auth required for callback
router.get('/status', verifyToken, discordCtrl.getDiscordStatus);
router.delete('/unlink', verifyToken, discordCtrl.unlinkAccount);

// Development/testing routes
router.get('/test', discordCtrl.testConnection);

module.exports = router;