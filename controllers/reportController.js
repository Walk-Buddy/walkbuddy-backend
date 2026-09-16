const reportService = require('../services/reportService');

/**
 * 신고 접수 컨트롤러 (일반 사용자)
 * POST /api/reports
 */
exports.createReport = async (req, res, next) => {
  try {
    const result = await reportService.createReport(req.user.user_id, req.body);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 내 신고 목록 조회 컨트롤러 (일반 사용자)
 * GET /api/reports/me
 */
exports.getMyReports = async (req, res, next) => {
  try {
    const result = await reportService.getMyReports(req.user.user_id, req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
