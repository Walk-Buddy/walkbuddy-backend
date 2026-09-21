const express = require('express');
const router = express.Router();
const regionController = require('../controllers/regionController');

// GET /api/regions - 지원 지역 목록 조회
router.get('/', regionController.getRegions);

module.exports = router;
