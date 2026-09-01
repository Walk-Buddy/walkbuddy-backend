const reportService = require('../services/reportService');

/**
 * 관리자 신고 목록 조회 컨트롤러
 * GET /api/admin/reports
 */
exports.getReports = async (req, res, next) => {
  try {
    const result = await reportService.getAdminReports(req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 관리자 신고 상세 조회 컨트롤러
 * GET /api/admin/reports/:report_id
 */
exports.getReportById = async (req, res, next) => {
  try {
    const result = await reportService.getAdminReportById(req.params.report_id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 관리자 신고 상태 변경 및 제재 처리 컨트롤러
 * PATCH /api/admin/reports/:report_id
 */
exports.updateReportStatus = async (req, res, next) => {
  try {
    const result = await reportService.updateReportStatus(
      req.user.user_id,
      req.params.report_id,
      req.body
    );
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
