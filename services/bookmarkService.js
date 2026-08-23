const pool = require('../config/db');

// ──────────────────────────────────────────────────────────────────────
// 북마크 추가
// ──────────────────────────────────────────────────────────────────────
exports.addBookmark = async (userId, targetId, targetType) => {
  if (!['course', 'spot'].includes(targetType)) {
    const err = new Error("target_type은 'course' 또는 'spot'이어야 합니다.");
    err.status = 400; throw err;
  }

  const table = targetType === 'course' ? 'courses' : 'spots';
  const idCol = targetType === 'course' ? 'course_id' : 'spot_id';
  const { rows: targetRows } = await pool.query(
    `SELECT 1 FROM ${table} WHERE ${idCol} = $1 AND status = 'active'`,
    [targetId]
  );
  if (!targetRows.length) {
    const err = new Error('존재하지 않거나 비활성 상태입니다.');
    err.status = 404; throw err;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO bookmarks (user_id, target_id, target_type)
       VALUES ($1, $2, $3)
       RETURNING bookmark_id, target_id, target_type, created_at`,
      [userId, targetId, targetType]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const dup = new Error('이미 북마크한 항목입니다.');
      dup.status = 409; throw dup;
    }
    throw err;
  }
};

// ──────────────────────────────────────────────────────────────────────
// 북마크 해제
// ──────────────────────────────────────────────────────────────────────
exports.removeBookmark = async (userId, bookmarkId) => {
  const { rows } = await pool.query(
    `DELETE FROM bookmarks WHERE bookmark_id = $1 AND user_id = $2 RETURNING bookmark_id`,
    [bookmarkId, userId]
  );
  if (!rows.length) {
    const err = new Error('북마크를 찾을 수 없습니다.');
    err.status = 404; throw err;
  }
  return { message: '해제되었습니다.' };
};

// ──────────────────────────────────────────────────────────────────────
// 북마크 목록 조회 (코스/스팟)
// ──────────────────────────────────────────────────────────────────────
exports.getBookmarks = async (userId, query) => {
  const { target_type, page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const conditions = [`b.user_id = $1`, `(c.course_id IS NOT NULL OR s.spot_id IS NOT NULL)`];
  const params = [userId];
  let idx = 2;
  if (target_type) {
    conditions.push(`b.target_type = $${idx++}`);
    params.push(target_type);
  }
  const where = conditions.join(' AND ');

  const { rows } = await pool.query(
    `SELECT
       b.bookmark_id, b.target_type, b.created_at,
       CASE b.target_type
         WHEN 'course' THEN jsonb_build_object(
           'course_id', c.course_id, 'name', c.name, 'category', c.category,
           'total_distance', c.total_distance, 'estimated_duration', c.estimated_duration,
           'is_public', c.is_public
         )
         WHEN 'spot' THEN jsonb_build_object(
           'spot_id', s.spot_id, 'name', s.name, 'address', s.address,
           'categories', s.categories, 'recommend_pct', s.recommend_pct
         )
       END AS target
     FROM bookmarks b
     LEFT JOIN courses c ON b.target_type = 'course' AND c.course_id = b.target_id AND c.status = 'active'
     LEFT JOIN spots   s ON b.target_type = 'spot'   AND s.spot_id   = b.target_id AND s.status = 'active'
     WHERE ${where}
     ORDER BY b.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, +limit, +offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total
     FROM bookmarks b
     LEFT JOIN courses c ON b.target_type = 'course' AND c.course_id = b.target_id AND c.status = 'active'
     LEFT JOIN spots   s ON b.target_type = 'spot'   AND s.spot_id   = b.target_id AND s.status = 'active'
     WHERE ${where}`,
    params
  );

  return { total: +countRows[0].total, page: +page, bookmarks: rows };
};
