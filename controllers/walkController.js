const walkService = require('../services/walkService');

exports.startWalk = async (req, res, next) => {
  try {
    const record = await walkService.startWalk(req.userId, req.body.course_id || null);
    return res.status(201).json(record);
  } catch (err) { next(err); }
};

exports.endWalk = async (req, res, next) => {
  try {
    const { gps_points } = req.body;
    if (!Array.isArray(gps_points) || gps_points.length < 2)
      return res.status(400).json({ success: false, message: 'gps_points는 최소 2개 이상이어야 합니다.' });
    const result = await walkService.endWalk(req.userId, req.params.id, gps_points);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.addSpot = async (req, res, next) => {
  try {
    const { lat, lng, name } = req.body;
    if (!lat || !lng || !name)
      return res.status(400).json({ success: false, message: 'lat, lng, name은 필수입니다.' });
    const spot = await walkService.addSpotDuringWalk(req.userId, req.params.id, req.body);
    return res.status(201).json(spot);
  } catch (err) { next(err); }
};