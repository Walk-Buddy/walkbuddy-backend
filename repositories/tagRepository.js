const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Tag Repository
//  승인된 태그 목록 조회
// ─────────────────────────────────────────────────────────────────────

const TagRepository = {

  // 승인된 태그 전체 목록 (카테고리별 정렬)
  async findAll() {
    const { rows } = await pool.query(
      `SELECT tag_id, tag_name, category
       FROM   master_tags
       WHERE  status = 'approved'
       ORDER  BY category NULLS LAST, tag_name ASC`
    );
    return rows;
  },
};

module.exports = TagRepository;
