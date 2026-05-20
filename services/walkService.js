const pool = require('../config/db');

// gps_points: [{ lat, lng }, ...] → WKT LINESTRING
const buildLineString = (gps_points) => {
  const points = gps_points.map((p) => `${p.lng} ${p.lat}`);
  return `SRID=4326;LINESTRING(${points.join(', ')})`;
};

// ──────────────────────────────────────────────────────────────────────
// 산책 시작
// course_id: 기존 코스 기반 산책이면 전달, 자유 경로면 null
// ──────────────────────────────────────────────────────────────────────
exports.startWalk = async (userId, courseId) => {
  const { rows: [record] } = await pool.query(
    `INSERT INTO walk_records (user_id, course_id)
     VALUES ($1, $2)
     RETURNING walk_record_id, started_at`,
    [userId, courseId]
  );
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// 산책 종료
// gps_points: 프론트에서 수집한 GPS 좌표 배열 [{ lat, lng }, ...]
// actual_route, total_distance, duration 저장
// ──────────────────────────────────────────────────────────────────────
exports.endWalk = async (userId, walkRecordId, gps_points) => {
  const { rows } = await pool.query(
    `SELECT walk_record_id FROM walk_records
     WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [walkRecordId, userId]
  );
  if (!rows.length) {
    const err = new Error('진행 중인 산책 기록을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  const wkt = buildLineString(gps_points);

  const { rows: [updated] } = await pool.query(
    `UPDATE walk_records
     SET actual_route   = $1::geography,
         ended_at       = NOW(),
         total_distance = ROUND(ST_Length($1::geography)),
         duration       = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)
     WHERE walk_record_id = $2
     RETURNING walk_record_id, total_distance, duration, started_at, ended_at`,
    [wkt, walkRecordId]
  );
  return updated;
};

// ──────────────────────────────────────────────────────────────────────
// 이동 중 스팟 등록
// 현재 위치(lat, lng)를 기준으로 spots INSERT
// ──────────────────────────────────────────────────────────────────────
exports.addSpotDuringWalk = async (userId, walkRecordId, body) => {
  const { lat, lng, name, description } = body;

  // 진행 중인 기록인지 확인
  const { rows } = await pool.query(
    `SELECT walk_record_id FROM walk_records
     WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [walkRecordId, userId]
  );
  if (!rows.length) {
    const err = new Error('진행 중인 산책 기록을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  const { rows: [spot] } = await pool.query(
    `INSERT INTO spots (name, location, address)
     VALUES ($1, ST_Point($2, $3)::geography, $4)
     RETURNING spot_id, name`,
    [name, lng, lat, description || null]
  );

  return spot;
};