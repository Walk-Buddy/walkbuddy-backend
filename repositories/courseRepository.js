const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course Repository
// ─────────────────────────────────────────────────────────────────────

const CourseRepository = {

  async findAll() {
    const { rows } = await pool.query(
      `SELECT * FROM courses WHERE is_deleted = FALSE ORDER BY created_at DESC`
    );
    return rows;
  },

  async findById(courseId) {
    const { rows } = await pool.query(
      `SELECT * FROM courses WHERE course_id = $1 AND is_deleted = FALSE`,
      [courseId]
    );
    return rows[0] || null;
  },

  // 코스 + 연결된 핀 목록 함께 조회
  async findWithPins(courseId) {
    const course = await this.findById(courseId);
    if (!course) return null;

    const { rows: pins } = await pool.query(
      `SELECT n.*,
         cp.node_order,
         ST_Y(n.location::geometry) AS latitude,
         ST_X(n.location::geometry) AS longitude
       FROM nodes n
       JOIN course_path cp ON cp.node_id = n.node_id
       WHERE cp.course_id = $1 AND n.node_type = 'pin'
       ORDER BY cp.node_order ASC`,
      [courseId]
    );
    return { ...course, pins };
  },

  async create({ title, description, creationType = 'manual', userId }) {
    const { rows } = await pool.query(
      `INSERT INTO courses (title, description, creation_type, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, description, creationType, userId]
    );
    return rows[0];
  },

  async update(courseId, fields) {
    const allowed = ['title', 'description', 'total_distance_km', 'estimated_minutes',
                     'difficulty', 'visibility', 'is_hidden'];
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key}=$${idx++}`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) return this.findById(courseId);

    updates.push(`updated_at=NOW()`);
    values.push(courseId);

    const { rows } = await pool.query(
      `UPDATE courses SET ${updates.join(', ')} WHERE course_id=$${idx} AND is_deleted=FALSE RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  // soft delete
  async delete(courseId) {
    const { rowCount } = await pool.query(
      `UPDATE courses SET is_deleted=TRUE WHERE course_id=$1`,
      [courseId]
    );
    return rowCount > 0;
  },

  // ── course_path (핀 연결) ─────────────────────────────────────────

  async addPin(courseId, nodeId) {
    // 현재 마지막 node_order + 1
    const { rows: existing } = await pool.query(
      `SELECT COALESCE(MAX(node_order), 0) + 1 AS next_order
       FROM course_path WHERE course_id = $1`,
      [courseId]
    );
    const nextOrder = existing[0].next_order;

    const { rows } = await pool.query(
      `INSERT INTO course_path (course_id, node_id, node_order)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT uq_course_path_node DO NOTHING
       RETURNING *`,
      [courseId, nodeId, nextOrder]
    );
    return rows[0];
  },

  async removePin(courseId, nodeId) {
    const { rowCount } = await pool.query(
      `DELETE FROM course_path WHERE course_id=$1 AND node_id=$2`,
      [courseId, nodeId]
    );
    return rowCount > 0;
  },
};

module.exports = CourseRepository;