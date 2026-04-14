const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Bookmark List Repository
//  특정 사용자의 북마크 코스 목록 조회
// ─────────────────────────────────────────────────────────────────────

const BookmarkListRepository = {

  /**
   * 사용자의 북마크 목록 조회
   * @param {string} userId
   * @param {number} page   - 1-based
   * @param {number} limit  - 페이지당 개수 (max 100)
   * @returns {{ courses: object[], total: number }}
   */
  async findByUser(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT c.course_id,
                c.title,
                c.description,
                c.total_distance_km,
                c.estimated_minutes,
                c.difficulty,
                c.bookmark_count,
                c.avg_rating,
                c.created_at,
                b.created_at AS bookmarked_at
         FROM   bookmarks b
         JOIN   courses c ON c.course_id = b.course_id
         WHERE  b.user_id   = $1
           AND  c.is_deleted = FALSE
         ORDER  BY b.created_at DESC
         LIMIT  $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM   bookmarks b
         JOIN   courses c ON c.course_id = b.course_id
         WHERE  b.user_id   = $1
           AND  c.is_deleted = FALSE`,
        [userId]
      ),
    ]);

    return {
      courses: dataResult.rows,
      total:   parseInt(countResult.rows[0].total, 10),
    };
  },
};

module.exports = BookmarkListRepository;
