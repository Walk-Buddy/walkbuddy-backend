/**
 * controllers/durunubiController.js
 *
 * 두루누비 실시간 API 컨트롤러
 * - HTTP 요청(req)을 받아 durunubiService를 호출하고 응답(res)을 반환합니다.
 * - 에러는 next(err)로 넘겨 errorHandler 미들웨어가 처리합니다.
 */

const durunubiService = require('../services/durunubiService');

/**
 * GET /api/tour/durunubi/courses
 * 쿼리 파라미터: region (필수), brdDiv (선택), page, limit
 */
exports.getCourses = async (req, res, next) => {
  try {
    const result = await durunubiService.getDurunubiCourses(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tour/durunubi/courses/:crs_idx
 * 경로 파라미터: crs_idx (두루누비 코스 고유 ID)
 */
exports.getCourseDetail = async (req, res, next) => {
  try {
    const result = await durunubiService.getDurunubiCourseDetail(req.params.crs_idx);
    return res.json({ success: true, course: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tour/durunubi/courses/:crs_idx/spots
 * 경로 파라미터: crs_idx (두루누비 코스 고유 ID)
 */
exports.getCourseSpots = async (req, res, next) => {
  try {
    const result = await durunubiService.getDurunubiCourseSpots(req.params.crs_idx);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};
