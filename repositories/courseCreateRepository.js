const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course Create Repository
//  코스 등록 (트랜잭션): courses + course_path(핀/스팟) + course_tags
// ─────────────────────────────────────────────────────────────────────

const CourseCreateRepository = {

  /**
   * 코스 등록 (트랜잭션)
   * @param {object} opts
   * @param {string}   opts.userId
   * @param {string}   opts.title
   * @param {string}   [opts.description]
   * @param {string}   [opts.visibility]  - 'public' | 'private' (기본 'public')
   * @param {string[]} opts.pins          - 핀 nodeId 배열 (순서대로, 2개 이상)
   * @param {string[]} [opts.spots]       - 스팟 nodeId 배열
   * @param {string[]} [opts.tags]        - master_tags의 tag_id 배열
   * @returns {string} courseId
   */
  async create({ userId, title, description, visibility = 'public', pins = [], spots = [], tags = [] }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. 코스 레코드 생성 ───────────────────────────────────────
      const { rows: courseRows } = await client.query(
        `INSERT INTO courses (title, description, creation_type, visibility, user_id)
         VALUES ($1, $2, 'manual', $3, $4)
         RETURNING course_id`,
        [title, description || null, visibility, userId]
      );
      const courseId = courseRows[0].course_id;

      // ── 2. 핀 순서대로 course_path 추가 ──────────────────────────
      for (let i = 0; i < pins.length; i++) {
        await client.query(
          `INSERT INTO course_path (course_id, node_id, node_order)
           VALUES ($1, $2, $3)
           ON CONFLICT ON CONSTRAINT uq_course_path_node DO NOTHING`,
          [courseId, pins[i], i + 1]
        );
      }

      // ── 3. 스팟 course_path 추가 (핀 뒤 순서 이어서) ─────────────
      for (let i = 0; i < spots.length; i++) {
        await client.query(
          `INSERT INTO course_path (course_id, node_id, node_order)
           VALUES ($1, $2, $3)
           ON CONFLICT ON CONSTRAINT uq_course_path_node DO NOTHING`,
          [courseId, spots[i], pins.length + i + 1]
        );
      }

      // ── 4. 태그 연결 ──────────────────────────────────────────────
      for (const tagId of tags) {
        await client.query(
          `INSERT INTO course_tags (course_id, tag_id)
           VALUES ($1, $2)
           ON CONFLICT ON CONSTRAINT uq_course_tag_mapping DO NOTHING`,
          [courseId, tagId]
        );
      }

      await client.query('COMMIT');
      return courseId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = CourseCreateRepository;
