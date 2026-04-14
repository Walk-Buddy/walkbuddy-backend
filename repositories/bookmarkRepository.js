const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Bookmark Repository
//  bookmark_count 는 DB 트리거(trg_update_bookmark_stats)가 자동 갱신
// ─────────────────────────────────────────────────────────────────────

const BookmarkRepository = {

  // 북마크 존재 여부 확인
  async exists(userId, courseId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM bookmarks WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );
    return rows.length > 0;
  },

  // 북마크 추가
  async add(userId, courseId) {
    await pool.query(
      `INSERT INTO bookmarks (user_id, course_id) VALUES ($1, $2)
       ON CONFLICT ON CONSTRAINT uq_bookmark DO NOTHING`,
      [userId, courseId]
    );
  },

  // 북마크 삭제
  async remove(userId, courseId) {
    await pool.query(
      `DELETE FROM bookmarks WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );
  },

  // 최신 bookmark_count 조회
  async getCount(courseId) {
    const { rows } = await pool.query(
      `SELECT bookmark_count FROM courses WHERE course_id = $1`,
      [courseId]
    );
    return rows[0]?.bookmark_count ?? 0;
  },

  // 토글: 있으면 삭제, 없으면 추가 → { bookmarked, count } 반환
  async toggle(userId, courseId) {
    const already = await this.exists(userId, courseId);
    if (already) {
      await this.remove(userId, courseId);
    } else {
      await this.add(userId, courseId);
    }
    const count = await this.getCount(courseId);
    return { bookmarked: !already, count };
  },
};

module.exports = BookmarkRepository;
