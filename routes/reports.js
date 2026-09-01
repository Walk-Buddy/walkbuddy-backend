const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

// ── 일반 사용자 신고 라우트 ──────────────────────────────────────────
router.post('/', authenticate, reportController.createReport);
router.get('/me', authenticate, reportController.getMyReports);

module.exports = router;
