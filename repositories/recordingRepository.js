const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Recording Repository  (Day 5-6: GPS 기록)
//  activity_records 테이블 기반
//  status: 'active' | 'paused' | 'completed'
// ─────────────────────────────────────────────────────────────────────

const RecordingRepository = {

  // ── 기록 세션 ──────────────────────────────────────────────────────

  async findById(activityRecordId) {
    const { rows } = await pool.query(
      `SELECT * FROM activity_records WHERE activity_record_id = $1`,
      [activityRecordId]
    );
    return rows[0] || null;
  },

  // 기록 시작
  async start(userId) {
    const { rows } = await pool.query(
      `INSERT INTO activity_records (user_id, started_at, status)
       VALUES ($1, NOW(), 'active')
       RETURNING *`,
      [userId]
    );
    return rows[0];
  },

  // 기록 종료
  async finish(activityRecordId) {
    const { rows } = await pool.query(
      `UPDATE activity_records
       SET status='completed',
           ended_at=NOW(),
           is_completed=TRUE,
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT
       WHERE activity_record_id=$1 AND status IN ('active', 'paused')
       RETURNING *`,
      [activityRecordId]
    );
    return rows[0] || null;
  },

  // 일시정지
  async pause(activityRecordId) {
    const { rows } = await pool.query(
      `UPDATE activity_records SET status='paused', pause_count=pause_count+1
       WHERE activity_record_id=$1 AND status='active'
       RETURNING *`,
      [activityRecordId]
    );
    return rows[0] || null;
  },

  // 재개
  async resume(activityRecordId) {
    const { rows } = await pool.query(
      `UPDATE activity_records SET status='active'
       WHERE activity_record_id=$1 AND status='paused'
       RETURNING *`,
      [activityRecordId]
    );
    return rows[0] || null;
  },

  // 기록 완료 후 코스 연결
  async linkCourse(activityRecordId, courseId) {
    const { rows } = await pool.query(
      `UPDATE activity_records SET course_id=$1
       WHERE activity_record_id=$2
       RETURNING *`,
      [courseId, activityRecordId]
    );
    return rows[0] || null;
  },

  // GPS 경로 전체 업데이트 (PostGIS LineString)
  // coordinates: [{lat, lng}, ...]
  async updateActualRoute(activityRecordId, coordinates) {
    if (!coordinates.length) return null;

    const points = coordinates.map(c => `${c.lng} ${c.lat}`).join(',');
    const wkt = `LINESTRING(${points})`;

    const totalDistanceKm = coordinates.length > 1
      ? coordinates.reduce((sum, c, i) => {
          if (i === 0) return 0;
          const prev = coordinates[i - 1];
          const R = 6371;
          const dLat = ((c.lat - prev.lat) * Math.PI) / 180;
          const dLng = ((c.lng - prev.lng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2
            + Math.cos((prev.lat * Math.PI) / 180)
            * Math.cos((c.lat * Math.PI) / 180)
            * Math.sin(dLng / 2) ** 2;
          return sum + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }, 0)
      : 0;

    const { rows } = await pool.query(
      `UPDATE activity_records
       SET actual_route = ST_GeomFromText($1, 4326),
           actual_distance_km = $2
       WHERE activity_record_id=$3
       RETURNING *`,
      [wkt, Math.round(totalDistanceKm * 100) / 100, activityRecordId]
    );
    return rows[0] || null;
  },
};

module.exports = RecordingRepository;