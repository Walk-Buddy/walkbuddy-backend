const express = require('express');
const router = express.Router();
const adminReportController = require('../controllers/adminReportController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ── 관리자 공통 미들웨어 적용: JWT 인증 및 관리자 권한 확인 ────────────
router.use(authenticate, requireAdmin);

// ── 신고 관리 라우트 ──────────────────────────────────────────────────
router.get('/reports', adminReportController.getReports);
router.get('/reports/:report_id', adminReportController.getReportById);
router.patch('/reports/:report_id', adminReportController.updateReportStatus);

module.exports = router;
