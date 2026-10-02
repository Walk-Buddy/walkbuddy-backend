const courseService = require('../services/courseService');
const tourApiService = require('../services/tourApiService');
const pool = require('../config/db');

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
    const waypoints = Array.isArray(req.body.waypoints) ? req.body.waypoints : [];
    if (!name?.trim())
      return res.status(400).json({ success: false, message: '코스 이름은 필수입니다.' });
    if (name.length > 100)
      return res.status(400).json({ success: false, message: '코스 이름은 100자 이하여야 합니다.' });
    // route가 없을 때만 waypoints 검사
    if (!route && waypoints.length < 2)
      return res.status(400).json({ success: false, message: '경유지는 최소 2개 이상이어야 합니다.' });
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
    const result = await courseService.getCourses(req.query, req.user?.user_id);
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
    if (name !== undefined && name.length > 100)
      return res.status(400).json({ success: false, message: '코스 이름은 100자 이하여야 합니다.' });
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

// 코스 사진 조회 (관광사진 API - gallerySearchList1 키워드 검색 + 경유지 스팟 연동)
exports.getCoursePhotos = async (req, res, next) => {
  try {
    const { course_id } = req.params;

    // DB에서 코스 이름과 사진 캐시 조회
    // 관광사진 검색은 코스명·경유지마다 TourAPI를 불러 수 초가 걸리므로 결과를 코스에 저장해 둔다.
    // 사진이 있으면 7일, 없으면 1일 동안 재사용 (일시적 API 실패로 빈 결과가 오래 남지 않게)
    const { rows } = await pool.query(
      `SELECT name, photo_cache,
              photo_cached_at > NOW() - (CASE
                WHEN jsonb_array_length(COALESCE(photo_cache->'photos', '[]'::jsonb)) > 0 THEN INTERVAL '7 days'
                ELSE INTERVAL '1 day' END) AS cache_fresh
       FROM courses WHERE course_id = $1 AND status != 'deleted'`,
      [course_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    const { name, photo_cache: photoCache, cache_fresh: cacheFresh } = rows[0];
    if (cacheFresh && photoCache) {
      return res.json({ success: true, course_id, course_name: name, ...photoCache, cached: true });
    }

    // 코스 경유지 스팟 이름들 조회
    const { rows: waypointSpots } = await pool.query(
      `SELECT DISTINCT s.name
       FROM course_waypoints cw
       JOIN spots s ON s.spot_id = cw.spot_id
       WHERE cw.course_id = $1 AND cw.type = 'spot' AND s.name IS NOT NULL`,
      [course_id]
    );
    const spotNames = waypointSpots.map((r) => r.name);

    const result = await tourApiService.getCoursePhotos(name, spotNames);
    await pool.query(
      `UPDATE courses SET photo_cache = $2::jsonb, photo_cached_at = NOW() WHERE course_id = $1`,
      [course_id, JSON.stringify(result)]
    ).catch((err) => console.warn('[course photos] 캐시 저장 실패:', err.message));

    return res.json({ success: true, course_id, course_name: name, ...result });
  } catch (err) { next(err); }
};

// 코스 오디오 사전 생성 (비동기 백그라운드 0초 딜레이 Warm-up)
exports.prewarmCourseAudio = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const aiContentService = require('../services/aiContentService');
    aiContentService.prewarmCourseAudio(course_id).catch(err => {
      console.error(`[PrewarmAudio] Failed for course ${course_id}:`, err.message);
    });
    return res.status(202).json({
      success: true,
      message: '코스 음성 안내 사전 생성이 백그라운드에서 시작되었습니다.',
      course_id,
    });
  } catch (err) { next(err); }
};
