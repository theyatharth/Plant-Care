const express = require('express');
const router = express.Router();
const encyclopediaCtrl = require('../controllers/encyclopediaCtrl');

// Public routes - anyone can browse encyclopedia
router.get('/', encyclopediaCtrl.getAllPlants);
router.get('/:id', encyclopediaCtrl.getPlantById);

module.exports = router;
