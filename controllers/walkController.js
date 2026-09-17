const walkService = require('../services/walkService');

// POST /api/walks
exports.startWalk = async (req, res, next) => {
  try {
    const record = await walkService.startWalk(req.user.user_id, req.body.course_id || null);
    return res.status(201).json(record);
  } catch (err) { next(err); }
};

// PATCH /api/walks/:walkRecordId/end
exports.endWalk = async (req, res, next) => {
  try {
    const { total_distance, duration, is_completed } = req.body;
    
    // 1번 방식(비신고): 위치 궤적 없이 통계 요약 데이터만 전달
    const result = await walkService.endWalk(req.user.user_id, req.params.walkRecordId, {
      total_distance,
      duration,
      is_completed
    });
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

// GET /api/walks
exports.getWalkList = async (req, res, next) => {
  try {
    const result = await walkService.getWalkList(req.user.user_id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

// GET /api/walks/:walkRecordId
exports.getWalkDetail = async (req, res, next) => {
  try {
    const result = await walkService.getWalkDetail(req.user.user_id, req.params.walkRecordId);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};