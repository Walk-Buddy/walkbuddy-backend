const pool = require('../config/db');

// gps_points: [{ lat, lng }, ...] → WKT LINESTRING
const buildLineString = (gps_points) => {
  const points = gps_points.map((p) => `${p.lng} ${p.lat}`);
  return `SRID=4326;LINESTRING(${points.join(', ')})`;
};

// ──────────────────────────────────────────────────────────────────────
// 산책 시작
// ──────────────────────────────────────────────────────────────────────
exports.startWalk = async (userId, courseId) => {
  const { rows: [record] } = await pool.query(
    `INSERT INTO walk_records (user_id, course_id)
     VALUES ($1, $2)
     RETURNING walk_record_id, course_id, started_at`,
    [userId, courseId]
  );
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// 산책 종료
// ──────────────────────────────────────────────────────────────────────
exports.endWalk = async (userId, walkRecordId, gps_points) => {
  const { rows } = await pool.query(
    `SELECT walk_record_id, course_id FROM walk_records
     WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [walkRecordId, userId]
  );
  if (!rows.length) {
    const err = new Error('진행 중인 산책 기록을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  const wkt = buildLineString(gps_points);

  // 완주 여부: 실제 이동거리가 코스 총거리의 95% 이상
  const { rows: [updated] } = await pool.query(
  `UPDATE walk_records
   SET actual_route   = $1::geography,
       ended_at       = NOW(),
       total_distance = ROUND(ST_Length($1::geography))::int,
       duration       = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::int,
       is_completed   = CASE
         WHEN walk_records.course_id IS NULL THEN true  -- 자유 산책: 종료 = 완료
         ELSE COALESCE(
           (
             SELECT ROUND(ST_Length($1::geography)) >= c.total_distance * 0.95
             FROM courses c
             WHERE c.course_id = walk_records.course_id
           ),
           false
         )
       END
   WHERE walk_record_id = $2
   RETURNING walk_record_id, total_distance, duration, is_completed, started_at, ended_at`,
  [wkt, walkRecordId]
);
  return updated;
};

// ──────────────────────────────────────────────────────────────────────
// 산책 기록 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getWalkList = async (userId) => {
  const { rows } = await pool.query(
    `SELECT
       wr.walk_record_id,
       wr.course_id,
       c.name        AS course_name,
       wr.total_distance,
       wr.duration,
       wr.is_completed,
       wr.started_at,
       wr.ended_at,
       cr.course_review_id,
       cr.description AS review_description,
       cr.rating       AS review_rating,
       cr.difficulty   AS review_difficulty,
       cr.is_public     AS review_is_public,
       (wr.is_completed AND wr.course_id IS NOT NULL AND cr.course_review_id IS NULL) AS needs_review
     FROM walk_records wr
     LEFT JOIN courses c ON c.course_id = wr.course_id
     LEFT JOIN course_reviews cr ON cr.walk_record_id = wr.walk_record_id AND cr.status = 'active'
     WHERE wr.user_id = $1
     ORDER BY needs_review DESC, wr.started_at DESC`,
    [userId]
  );

  const walks = rows.map((r) => ({
    walk_record_id: r.walk_record_id,
    course_id: r.course_id,
    course_name: r.course_name,
    total_distance: r.total_distance,
    duration: r.duration,
    is_completed: r.is_completed,
    started_at: r.started_at,
    ended_at: r.ended_at,
    needs_review: r.needs_review,
    review: r.course_review_id ? {
      course_review_id: r.course_review_id,
      description: r.review_description,
      rating: r.review_rating,
      difficulty: r.review_difficulty,
      is_public: r.review_is_public,
    } : null,
  }));

  return { total: walks.length, walks };
};

// ──────────────────────────────────────────────────────────────────────
// 산책 기록 상세 조회
// ──────────────────────────────────────────────────────────────────────
exports.getWalkDetail = async (userId, walkRecordId) => {
  const { rows } = await pool.query(
    `SELECT
       wr.walk_record_id,
       wr.total_distance,
       wr.duration,
       wr.is_completed,
       wr.started_at,
       wr.ended_at,
       ST_AsGeoJSON(wr.actual_route)::json AS actual_route,
       json_build_object(
         'course_id',          c.course_id,
         'name',               c.name,
         'total_distance',     c.total_distance,
         'estimated_duration', c.estimated_duration
       ) AS course
     FROM walk_records wr
     LEFT JOIN courses c ON c.course_id = wr.course_id
     WHERE wr.walk_record_id = $1 AND wr.user_id = $2`,
    [walkRecordId, userId]
  );
  if (!rows.length) {
    const err = new Error('산책 기록을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }
  return rows[0];
};