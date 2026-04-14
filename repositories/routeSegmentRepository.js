const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  RouteSegment Repository
//  ⚠️  route_segments 테이블은 DB 스키마에 없으므로 DB 담당자에게
//      아래 DDL 추가 요청 필요:
//
//  CREATE TABLE IF NOT EXISTS route_segments (
//    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//    course_id    UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
//    from_node_id UUID NOT NULL REFERENCES nodes(node_id),
//    to_node_id   UUID NOT NULL REFERENCES nodes(node_id),
//    order_index  INT  NOT NULL DEFAULT 0,
//    coordinates  JSONB NOT NULL DEFAULT '[]',
//    distance     FLOAT DEFAULT 0,
//    duration     FLOAT DEFAULT 0,
//    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//    CONSTRAINT uq_route_segment UNIQUE (course_id, from_node_id, to_node_id)
//  );
// ─────────────────────────────────────────────────────────────────────

const RouteSegmentRepository = {

  async findByCourse(courseId) {
    const { rows } = await pool.query(
      `SELECT * FROM route_segments WHERE course_id = $1 ORDER BY order_index ASC`,
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

  async findByNodes(courseId, fromNodeId, toNodeId) {
    const { rows } = await pool.query(
      `SELECT * FROM route_segments
       WHERE course_id=$1 AND from_node_id=$2 AND to_node_id=$3`,
      [courseId, fromNodeId, toNodeId]
    );
    return rows[0] || null;
  },

  async upsert({ courseId, fromNodeId, toNodeId, orderIndex, coordinates, distance, duration }) {
    const { rows } = await pool.query(
      `INSERT INTO route_segments
         (course_id, from_node_id, to_node_id, order_index, coordinates, distance, duration)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT ON CONSTRAINT uq_route_segment DO NOTHING
       RETURNING *`,
      [courseId, fromNodeId, toNodeId, orderIndex, JSON.stringify(coordinates), distance, duration]
    );

    if (!rows[0]) {
      const { rows: updated } = await pool.query(
        `UPDATE route_segments
         SET coordinates=$1::jsonb, distance=$2, duration=$3, order_index=$4, updated_at=NOW()
         WHERE course_id=$5 AND from_node_id=$6 AND to_node_id=$7
         RETURNING *`,
        [JSON.stringify(coordinates), distance, duration, orderIndex, courseId, fromNodeId, toNodeId]
      );
      return updated[0];
    }
    return rows[0];
  },

  async deleteByCourse(courseId) {
    await pool.query(`DELETE FROM route_segments WHERE course_id = $1`, [courseId]);
  },

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