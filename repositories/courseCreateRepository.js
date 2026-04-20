const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course Create Repository
//  코스 등록 (트랜잭션): nodes(신규 핀) + courses + course_path + course_tags
// ─────────────────────────────────────────────────────────────────────

const CourseCreateRepository = {
  /**
   * 코스 등록 (트랜잭션)
   * @param {object} opts
   * @param {string}   opts.userId      - 작성자 UUID
   * @param {string}   opts.title       - 코스 제목
   * @param {string}   [opts.description]
   * @param {string}   [opts.visibility] - 'public' | 'private'
   * @param {object[]} opts.pins        - [{lat: 37.1, lng: 126.1}, ...] 좌표 배열
   * @param {string[]} [opts.spots]     - 기존 스팟 node_id(UUID) 배열
   * @param {string[]} [opts.tags]      - 태그 이름(['힐링', '산책']) 배열
   * @returns {string} courseId
   */
  async create({ userId, title, description, visibility = 'public', pins = [], spots = [], tags = [] }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. 좌표(pins)를 nodes 테이블에 먼저 저장하고 ID 추출 ──────────
      // 프론트에서 보낸 [{lat, lng}, ...] 객체를 DB 노드로 변환합니다.
      const pinIds = [];
      for (const pin of pins) {
        const { rows: nodeRows } = await client.query(
          `INSERT INTO nodes (node_type, location, user_id)
           VALUES ('pin', ST_SetSRID(ST_MakePoint($2, $1), 4326), $3)
           RETURNING node_id`,
          [pin.lat, pin.lng, userId]
        );
        pinIds.push(nodeRows[0].node_id);
      }

      // ── 2. 코스 기본 정보 생성 ───────────────────────────────────────
      const { rows: courseRows } = await client.query(
        `INSERT INTO courses (title, description, creation_type, visibility, user_id)
         VALUES ($1, $2, 'manual', $3, $4)
         RETURNING course_id`,
        [title, description || null, visibility, userId]
      );
      const courseId = courseRows[0].course_id;

      // ── 3. 생성된 핀 ID로 course_path 추가 (순서 보장) ───────────────
      for (let i = 0; i < pinIds.length; i++) {
        await client.query(
          `INSERT INTO course_path (course_id, node_id, node_order)
           VALUES ($1, $2, $3)`,
          [courseId, pinIds[i], i + 1]
        );
      }

      // ── 4. 선택된 스팟(기존 노드) course_path 추가 ───────────────────
      for (let i = 0; i < spots.length; i++) {
        // spots[i]가 UUID 형식일 때만 처리
        if (typeof spots[i] === 'string' && spots[i].length === 36) {
          await client.query(
            `INSERT INTO course_path (course_id, node_id, node_order)
             VALUES ($1, $2, $3)
             ON CONFLICT ON CONSTRAINT uq_course_path_node DO NOTHING`,
            [courseId, spots[i], pinIds.length + i + 1]
          );
        }
      }

      // ── 5. 태그 연결 (이름으로 ID 조회 후 삽입) ───────────────────────
      for (const tagName of tags) {
        // tag_name으로 tag_id 조회 (master_tags 테이블 기준)
        const { rows: tagRows } = await client.query(
          `SELECT tag_id FROM master_tags WHERE tag_name = $1`,
          [tagName]
        );

        // 태그가 존재할 때만 연결 (DB에 없는 태그 이름은 무시)
        if (tagRows.length > 0) {
          const tagId = tagRows[0].tag_id;
          await client.query(
            `INSERT INTO course_tags (course_id, tag_id)
             VALUES ($1, $2)
             ON CONFLICT ON CONSTRAINT uq_course_tag_mapping DO NOTHING`,
            [courseId, tagId]
          );
        }
      }

      await client.query('COMMIT');
      return courseId;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error("❌ Repository Error during Transaction:", err);
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = CourseCreateRepository;