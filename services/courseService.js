const pool = require('../config/db');

const WALK_SPEED_MPS = 1.1; // 도보 평균 4km/h

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: spot_id 배열 → { spot_id: { lat, lng } } 맵
// ──────────────────────────────────────────────────────────────────────
const fetchSpotCoords = async (spotIds, client) => {
  if (!spotIds.length) return {};
  const { rows } = await client.query(
    `SELECT spot_id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM spots WHERE spot_id = ANY($1::uuid[]) AND status = 'active'`,
    [spotIds]
  );
  const map = {};
  rows.forEach((r) => { map[r.spot_id] = { lat: +r.lat, lng: +r.lng }; });
  const missing = spotIds.filter((id) => !map[id]);
  if (missing.length) {
    const err = new Error(`존재하지 않거나 비활성 스팟: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return map;
};

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: waypoints → WKT LINESTRING
// ──────────────────────────────────────────────────────────────────────
const buildLineString = async (waypoints, client) => {
  const spotIds = waypoints.filter((w) => w.type === 'spot').map((w) => w.spot_id);
  const coords = await fetchSpotCoords(spotIds, client);
  const points = waypoints.map((w) =>
    w.type === 'spot'
      ? `${coords[w.spot_id].lng} ${coords[w.spot_id].lat}`
      : `${w.lng} ${w.lat}`
  );
  return `SRID=4326;LINESTRING(${points.join(', ')})`;
};

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: WKT → 총 거리(m) + 예상 소요 시간(분)
// ──────────────────────────────────────────────────────────────────────
const calcStats = async (wkt, client) => {
  const { rows } = await client.query(
    `SELECT ST_Length($1::geography) AS dist`, [wkt]
  );
  const totalDistance = Math.round(+rows[0].dist);
  const estimatedDuration = Math.ceil(totalDistance / WALK_SPEED_MPS / 60);
  return { totalDistance, estimatedDuration };
};

// ──────────────────────────────────────────────────────────────────────
// 태그 처리 공통 함수
// ──────────────────────────────────────────────────────────────────────
const insertTags = async (tagIds, courseId, userId, client) => {
  if (!tagIds.length) return;
  const { rows: validTags } = await client.query(
    `SELECT tag_id FROM tags WHERE tag_id = ANY($1::uuid[]) AND type = 'course' AND is_active = TRUE`,
    [tagIds]
  );
  for (const { tag_id } of validTags)
    await client.query(
      `INSERT INTO taggings (tag_id, target_id, target_type, user_id) VALUES ($1,$2,'course',$3) ON CONFLICT DO NOTHING`,
      [tag_id, courseId, userId]
    );
};

// ──────────────────────────────────────────────────────────────────────
// 코스 미리보기 (저장 없이 거리·시간·경로 계산)
// ──────────────────────────────────────────────────────────────────────
exports.previewCourse = async (waypoints) => {
  const client = await pool.connect();
  try {
    const wkt = await buildLineString(waypoints, client);
    const { totalDistance, estimatedDuration } = await calcStats(wkt, client);
    const { rows } = await client.query(
      `SELECT ST_AsGeoJSON($1::geography)::json AS geojson`, [wkt]
    );
    return {
      geojson: rows[0].geojson,
      total_distance: totalDistance,
      estimated_duration: estimatedDuration,
    };
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 수동 코스 생성
// waypoints: [{ type: 'spot', spot_id }, { type: 'pin', lat, lng }]
// ──────────────────────────────────────────────────────────────────────
exports.createCourse = async (userId, body) => {
  const { name, description, category, is_public = true, tag_ids = [], waypoints } = body;

  for (const [i, w] of waypoints.entries()) {
    if (w.type === 'spot' && !w.spot_id) {
      const err = new Error(`waypoints[${i}]: spot 타입은 spot_id가 필수입니다.`);
      err.status = 400; throw err;
    }
    if (w.type === 'pin' && (w.lat == null || w.lng == null)) {
      const err = new Error(`waypoints[${i}]: pin 타입은 lat, lng가 필수입니다.`);
      err.status = 400; throw err;
    }
    if (!['spot', 'pin'].includes(w.type)) {
      const err = new Error(`waypoints[${i}]: type은 'spot' 또는 'pin'이어야 합니다.`);
      err.status = 400; throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const wkt = await buildLineString(waypoints, client);
    const { totalDistance, estimatedDuration } = await calcStats(wkt, client);

    const { rows: [course] } = await client.query(
      `INSERT INTO courses (owner_id, name, description, category, route_geometry, total_distance, estimated_duration, is_public)
       VALUES ($1,$2,$3,$4,$5::geography,$6,$7,$8)
       RETURNING course_id, name, total_distance, estimated_duration, is_public, created_at`,
      [userId, name, description || null, category || null, wkt, totalDistance, estimatedDuration, is_public]
    );

    for (const [i, w] of waypoints.entries()) {
      if (w.type === 'spot')
        await client.query(
          `INSERT INTO course_waypoints (course_id, seq, type, spot_id) VALUES ($1,$2,'spot',$3)`,
          [course.course_id, i + 1, w.spot_id]
        );
      else
        await client.query(
          `INSERT INTO course_waypoints (course_id, seq, type, lat, lng) VALUES ($1,$2,'pin',$3,$4)`,
          [course.course_id, i + 1, w.lat, w.lng]
        );
    }

    await insertTags(tag_ids, course.course_id, userId, client);

    // 경로 근처 스팟 자동 감지 (반경 50m)
    const existingSpotIds = waypoints.filter((w) => w.type === 'spot').map((w) => w.spot_id);
    const { rows: nearby } = await client.query(
      `SELECT spot_id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM spots WHERE status = 'active'
         AND ST_DWithin(location, $1::geography, 50)
         AND ($2::uuid[] IS NULL OR spot_id <> ALL($2::uuid[]))`,
      [wkt, existingSpotIds.length ? existingSpotIds : null]
    );

    await client.query('COMMIT');
    return { ...course, waypoints_count: waypoints.length, nearby_spots_suggestion: nearby };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 자동 코스 생성 (GPS 기록 기반)
// walk_records.actual_route → courses INSERT
// ──────────────────────────────────────────────────────────────────────
exports.createCourseFromWalk = async (userId, body) => {
  const { walk_record_id, name, description, is_public = true, tag_ids = [] } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 종료된 산책 기록 조회
    const { rows } = await client.query(
      `SELECT actual_route, total_distance, duration
       FROM walk_records
       WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NOT NULL`,
      [walk_record_id, userId]
    );
    if (!rows.length) {
      const err = new Error('종료된 산책 기록을 찾을 수 없습니다.');
      err.status = 404; throw err;
    }

    const { actual_route, total_distance, duration } = rows[0];

    if (!actual_route) {
      const err = new Error('GPS 경로 데이터가 없습니다.');
      err.status = 400; throw err;
    }

    const { rows: [course] } = await client.query(
      `INSERT INTO courses (owner_id, name, description, route_geometry, total_distance, estimated_duration, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING course_id, name, total_distance, estimated_duration, is_public, created_at`,
      [userId, name, description || null, actual_route, total_distance, Math.ceil(duration), is_public]
    );

    await insertTags(tag_ids, course.course_id, userId, client);

    await client.query('COMMIT');
    return course;
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};