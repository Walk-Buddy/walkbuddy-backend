const courseService = require('../services/courseService');

function normalizeCourseWaypoints(body) {
  if (Array.isArray(body.waypoints)) {
    return body.waypoints;
  }

  const coordinates = body.route?.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }

  return coordinates.map(([lng, lat]) => ({
    type: 'pin',
    lat,
    lng,
  }));
}

exports.previewCourse = async (req, res, next) => {
  try {
    const waypoints = normalizeCourseWaypoints(req.body);
    if (!Array.isArray(waypoints) || waypoints.length < 2)
      return res.status(400).json({ success: false, message: '경유지는 최소 2개 이상이어야 합니다.' });
    const preview = await courseService.previewCourse(waypoints);
    return res.status(200).json(preview);
  } catch (err) { next(err); }
};

exports.createCourse = async (req, res, next) => {
  try {
    const { name } = req.body;
    const waypoints = normalizeCourseWaypoints(req.body);
    if (!name?.trim())
      return res.status(400).json({ success: false, message: '코스 이름은 필수입니다.' });
    if (name.length > 100)
      return res.status(400).json({ success: false, message: '코스 이름은 100자 이하여야 합니다.' });
    if (!Array.isArray(waypoints) || waypoints.length < 2)
      return res.status(400).json({ success: false, message: '경유지는 최소 2개 이상이어야 합니다.' });
    const course = await courseService.createCourse(req.user.user_id, {
      ...req.body,
      waypoints,
    });
    return res.status(201).json(course);
  } catch (err) { next(err); }
};

exports.createCourseFromWalk = async (req, res, next) => {
  try {
    const { walk_record_id, name } = req.body;
    if (!walk_record_id || !name)
      return res.status(400).json({ success: false, message: 'walk_record_id, name은 필수입니다.' });
    const course = await courseService.createCourseFromWalk(req.user.user_id, req.body);
    return res.status(201).json(course);
  } catch (err) { next(err); }
};

exports.getCourses = async (req, res, next) => {
  try {
    const result = await courseService.getCourses(req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.searchCourses = async (req, res, next) => {
  try {
    const result = await courseService.searchCourses(req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getCourseById = async (req, res, next) => {
  try {
    const result = await courseService.getCourseById(req.params.course_id, req.user?.user_id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.updateCourse = async (req, res, next) => {
  try {
    const { name } = req.body;
    const hasWaypointInput = req.body.waypoints !== undefined || req.body.route !== undefined;
    const waypoints = hasWaypointInput ? normalizeCourseWaypoints(req.body) : undefined;
    if (name !== undefined && !name?.trim())
      return res.status(400).json({ success: false, message: '코스 이름은 필수입니다.' });
    if (hasWaypointInput && (!Array.isArray(waypoints) || waypoints.length < 2))
      return res.status(400).json({ success: false, message: '경유지는 최소 2개 이상이어야 합니다.' });
    const result = await courseService.updateCourse(req.user.user_id, req.params.course_id, {
      ...req.body,
      ...(hasWaypointInput ? { waypoints } : {}),
    });
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.deleteCourse = async (req, res, next) => {
  try {
    const result = await courseService.deleteCourse(req.user.user_id, req.params.course_id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};
