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
    const { gps_points, actual_route, total_distance, duration, is_completed } = req.body;
    
    // gps_points 또는 actual_route 둘 다 허용
    const points = gps_points || actual_route?.coordinates?.map(([lng, lat]) => ({ lat, lng }));
    
    if (!Array.isArray(points) || points.length < 2)
      return res.status(400).json({ success: false, message: 'gps_points는 최소 2개 이상이어야 합니다.' });
    
    const result = await walkService.endWalk(req.user.user_id, req.params.walkRecordId, points);
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