const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/userCtrl');
const { verifyToken } = require('../middleware/authMiddleware');

// Public route - Login/Register (after OTP verification in FlutterFlow)
router.post('/auth', userCtrl.loginOrRegister);

// Protected routes
router.get('/profile', verifyToken, userCtrl.getProfile);
router.put('/profile', verifyToken, userCtrl.updateProfile);

module.exports = router;
