const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/userCtrl');
const { verifyToken } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', userCtrl.register);
router.post('/login', userCtrl.login);

// Protected routes
router.get('/profile', verifyToken, userCtrl.getProfile);

module.exports = router;
