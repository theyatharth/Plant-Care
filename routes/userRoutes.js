const express = require('express');
const router = express.Router();

const userCtrl = require('../controllers/userCtrl');
const { verifyToken } = require('../middleware/authMiddleware');

// Public route - Login/Register (after OTP verification in FlutterFlow)
router.post('/auth', userCtrl.loginOrRegister);

// Protected routes
router.get('/profile', verifyToken, userCtrl.getProfile);
router.put('/profile', verifyToken, userCtrl.updateProfile);

// Profile photo routes
router.post('/profile/photo', verifyToken, userCtrl.uploadProfilePhoto);
router.get('/profile/photo', verifyToken, userCtrl.getProfilePhoto);

// Email authentication routes
router.post('/request-email-otp', userCtrl.requestEmailOTP);
router.post('/verify-email-otp', userCtrl.verifyEmailOTP);

module.exports = router;
