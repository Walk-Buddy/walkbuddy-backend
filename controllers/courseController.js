const courseService = require('../services/courseService');

exports.previewCourse = async (req, res, next) => {
  try {
    const waypoints = Array.isArray(req.body.waypoints) ? req.body.waypoints : null;
        if (!Array.isArray(waypoints))
      return res.status(400).json({ success: false, message: 'waypoints 형식이 올바르지 않습니다.'});
    const preview = await courseService.previewCourse(waypoints);
    return res.status(200).json(preview);
  } catch (err) { next(err); }
};

exports.createCourse = async (req, res, next) => {
  try {
    const { name } = req.body;
    const route = req.body.route ?? null;
    const waypoints = Array.isArray(req.body.waypoints) ? req.body.waypoints : null;

    if (!name?.trim())
      return res.status(400).json({ success: false, message: '코스 이름은 필수입니다.' });
    if (name.length > 100)
      return res.status(400).json({ success: false, message: '코스 이름은 100자 이하여야 합니다.' });
    if (!Array.isArray(waypoints))
      return res.status(400).json({ success: false, message: 'waypoints 형식이 올바르지 않습니다.'});
    const course = await courseService.createCourse(req.user.user_id, {
      ...req.body,
      route,
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
    const route = req.body.route !== undefined ? req.body.route : undefined;
    const waypoints = req.body.waypoints !== undefined
      ? (Array.isArray(req.body.waypoints) ? req.body.waypoints : null)
      : undefined;

    if (name !== undefined && !name?.trim())
      return res.status(400).json({ success: false, message: '코스 이름은 필수입니다.' });
    if (waypoints !== undefined && (!Array.isArray(waypoints)))
      return res.status(400).json({ success: false, message: 'waypoints 형식이 올바르지 않습니다.' });

    const result = await courseService.updateCourse(req.user.user_id, req.params.course_id, {
      ...req.body,
      ...(route !== undefined ? { route } : {}),
      ...(waypoints !== undefined ? { waypoints } : {}),
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