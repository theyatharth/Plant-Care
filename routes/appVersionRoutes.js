const express = require('express');
const router  = express.Router();

const appVersionCtrl = require('../controllers/appVersionCtrl');

// Public  — Flutter app calls this on startup to check for updates
router.get('/',  appVersionCtrl.getVersion);

// Admin   — Call from Postman with x-admin-key header when releasing a new version
router.patch('/', appVersionCtrl.updateVersion);

module.exports = router;
