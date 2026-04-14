const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course Repository  (Day 1: DB 기반 Entity/Repository 구현)
// ─────────────────────────────────────────────────────────────────────

const CourseRepository = {

  async findAll() {
    const { rows } = await pool.query(
      `SELECT * FROM courses ORDER BY created_at DESC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM courses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // 코스 + 연결된 핀 목록을 함께 조회
  async findWithPins(id) {
    const course = await this.findById(id);
    if (!course) return null;

    const { rows: pins } = await pool.query(
      `SELECT p.*, cp.order_index
       FROM pins p
       JOIN course_pins cp ON cp.pin_id = p.id
       WHERE cp.course_id = $1
       ORDER BY cp.order_index ASC`,
      [id]
    );
    return { ...course, pins };
  },

  async create({ name, description }) {
    const { rows } = await pool.query(
      `INSERT INTO courses (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [name, description]
    );
    return rows[0];
  },

  async update(id, fields) {
    const allowed = ['name', 'description', 'total_distance', 'estimated_time', 'difficulty', 'status'];
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key}=$${idx++}`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) return this.findById(id);

    updates.push(`updated_at=NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE courses SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async delete(id) {
    const { rowCount } = await pool.query(
      `DELETE FROM courses WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  },

  // 코스에 핀 추가 (order_index 자동 계산)
  async addPin(courseId, pinId) {
    const { rows: existing } = await pool.query(
      `SELECT MAX(order_index) AS max_idx FROM course_pins WHERE course_id = $1`,
      [courseId]
    );
    const nextOrder = (existing[0].max_idx ?? -1) + 1;

    const { rows } = await pool.query(
      `INSERT INTO course_pins (course_id, pin_id, order_index)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [courseId, pinId, nextOrder]
    );
    return rows[0];
  },

  async removePin(courseId, pinId) {
    const { rowCount } = await pool.query(
      `DELETE FROM course_pins WHERE course_id=$1 AND pin_id=$2`,
      [courseId, pinId]
    );
    return rowCount > 0;
  },
};

module.exports = CourseRepository;