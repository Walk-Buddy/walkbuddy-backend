const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  RouteSegment Repository  (Day 1: Entity / Day 2: 경로 좌표 저장)
// ─────────────────────────────────────────────────────────────────────

// ⚠️  upsert 정상 동작을 위해 DB에 아래 unique index 필요 (DB 담당자 확인 요청)
// CREATE UNIQUE INDEX IF NOT EXISTS idx_route_segments_unique
//   ON route_segments(course_id, from_pin_id, to_pin_id);

const RouteSegmentRepository = {

  // 코스의 모든 경로 세그먼트 조회 (순서대로)
  async findByCourse(courseId) {
    const { rows } = await pool.query(
      `SELECT * FROM route_segments
       WHERE course_id = $1
       ORDER BY order_index ASC`,
      [courseId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM route_segments WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // 특정 핀 쌍의 세그먼트 조회
  async findByPins(courseId, fromPinId, toPinId) {
    const { rows } = await pool.query(
      `SELECT * FROM route_segments
       WHERE course_id=$1 AND from_pin_id=$2 AND to_pin_id=$3`,
      [courseId, fromPinId, toPinId]
    );
    return rows[0] || null;
  },

  // 경로 세그먼트 저장 (upsert)
  async upsert({ courseId, fromPinId, toPinId, orderIndex, coordinates, distance, duration }) {
    const { rows } = await pool.query(
      `INSERT INTO route_segments
         (course_id, from_pin_id, to_pin_id, order_index, coordinates, distance, duration)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [courseId, fromPinId, toPinId, orderIndex, JSON.stringify(coordinates), distance, duration]
    );

    // 이미 존재하면 UPDATE
    if (!rows[0]) {
      const { rows: updated } = await pool.query(
        `UPDATE route_segments
         SET coordinates=$1::jsonb, distance=$2, duration=$3, order_index=$4, updated_at=NOW()
         WHERE course_id=$5 AND from_pin_id=$6 AND to_pin_id=$7
         RETURNING *`,
        [JSON.stringify(coordinates), distance, duration, orderIndex, courseId, fromPinId, toPinId]
      );
      return updated[0];
    }
    return rows[0];
  },

  async deleteByCourse(courseId) {
    await pool.query(
      `DELETE FROM route_segments WHERE course_id = $1`,
      [courseId]
    );
  },

  // 코스 전체 경로 좌표를 순서대로 펼쳐서 반환
  async getFullRouteCoordinates(courseId) {
    const segments = await this.findByCourse(courseId);
    const full = [];
    for (const seg of segments) {
      const coords = Array.isArray(seg.coordinates) ? seg.coordinates : [];
      full.push(...coords);
    }
    return full;
  },
};

module.exports = RouteSegmentRepository;