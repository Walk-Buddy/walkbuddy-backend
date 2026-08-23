const pool = require('../config/db');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

// ──────────────────────────────────────────────────────────────────────
// 내 프로필 조회
// ──────────────────────────────────────────────────────────────────────
exports.getProfile = async (userId) => {
  const { rows } = await pool.query(
    `SELECT user_id, email, nickname, profile_image_url,
            pref_tag_ids, pref_conditions, pref_categories,
            role, created_at
     FROM users
     WHERE user_id = $1 AND status != 'deleted'`,
    [userId]
  );
  if (!rows.length) {
    const err = new Error('사용자를 찾을 수 없습니다.');
    err.status = 404; throw err;
  }
  return rows[0];
};

// ──────────────────────────────────────────────────────────────────────
// 내 프로필 수정 (닉네임, 프로필 이미지, 성향 태그)
// 이메일(아이디)은 수정 불가
// ──────────────────────────────────────────────────────────────────────
exports.updateProfile = async (userId, body) => {
  const { nickname, profile_image_url, pref_tag_ids, pref_conditions, pref_categories } = body;

  if (nickname !== undefined) {
    if (nickname.length < 2 || nickname.length > 12) {
      const err = new Error('닉네임은 2~12자여야 합니다.');
      err.status = 400; throw err;
    }
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM users WHERE nickname = $1 AND user_id != $2`,
      [nickname, userId]
    );
    if (dup.length) {
      const err = new Error('이미 사용 중인 닉네임입니다.');
      err.status = 409; throw err;
    }
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET nickname           = COALESCE($1, nickname),
         profile_image_url  = COALESCE($2, profile_image_url),
         pref_tag_ids       = COALESCE($3::jsonb, pref_tag_ids),
         pref_conditions    = COALESCE($4::jsonb, pref_conditions),
         pref_categories    = COALESCE($5::jsonb, pref_categories),
         updated_at         = NOW()
     WHERE user_id = $6
     RETURNING user_id, nickname, profile_image_url, pref_tag_ids, pref_conditions, pref_categories, updated_at`,
    [
      nickname ?? null,
      profile_image_url ?? null,
      pref_tag_ids !== undefined ? JSON.stringify(pref_tag_ids) : null,
      pref_conditions !== undefined ? JSON.stringify(pref_conditions) : null,
      pref_categories !== undefined ? JSON.stringify(pref_categories) : null,
      userId,
    ]
  );
  return rows[0];
};

// ──────────────────────────────────────────────────────────────────────
// 비밀번호 변경
// ──────────────────────────────────────────────────────────────────────
exports.changePassword = async (userId, currentPassword, newPassword) => {
  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE user_id = $1`,
    [userId]
  );
  if (!rows.length) {
    const err = new Error('사용자를 찾을 수 없습니다.');
    err.status = 404; throw err;
  }

  const { password_hash } = rows[0];
  if (!password_hash) {
    const err = new Error('소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.');
    err.status = 400; throw err;
  }

  const matched = await bcrypt.compare(currentPassword, password_hash);
  if (!matched) {
    const err = new Error('현재 비밀번호가 일치하지 않습니다.');
    err.status = 401; throw err;
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`,
    [newHash, userId]
  );
  return { message: '비밀번호가 변경되었습니다.' };
};

// ──────────────────────────────────────────────────────────────────────
// 이용 기록 (산책 기록, 후기, 내가 만든 코스, 북마크 코스/스팟 통합, 최신순)
// ──────────────────────────────────────────────────────────────────────
const HISTORY_CTE = `
  WITH history AS (
    SELECT 'walk' AS history_type, wr.walk_record_id AS item_id,
           COALESCE(c.name, '자유 산책') AS title, wr.started_at AS occurred_at,
           jsonb_build_object(
             'course_id', wr.course_id, 'total_distance', wr.total_distance,
             'duration', wr.duration, 'is_completed', wr.is_completed
           ) AS detail
    FROM walk_records wr
    LEFT JOIN courses c ON c.course_id = wr.course_id
    WHERE wr.user_id = $1

    UNION ALL

    SELECT 'course_review', cr.course_review_id, c.name, cr.created_at,
           jsonb_build_object('course_id', cr.course_id, 'rating', cr.rating, 'is_public', cr.is_public)
    FROM course_reviews cr
    JOIN courses c ON c.course_id = cr.course_id
    WHERE cr.user_id = $1 AND cr.status = 'active'

    UNION ALL

    SELECT 'spot_review', sr.spot_review_id, s.name, sr.created_at,
           jsonb_build_object('spot_id', sr.spot_id, 'is_recommended', sr.is_recommended, 'is_public', sr.is_public)
    FROM spot_reviews sr
    JOIN spots s ON s.spot_id = sr.spot_id
    WHERE sr.user_id = $1 AND sr.status = 'active'

    UNION ALL

    SELECT 'course_created', c.course_id, c.name, c.created_at,
           jsonb_build_object('is_public', c.is_public, 'total_distance', c.total_distance)
    FROM courses c
    WHERE c.owner_id = $1 AND c.status != 'deleted'

    UNION ALL

    SELECT 'bookmark_course', b.bookmark_id, c.name, b.created_at,
           jsonb_build_object('course_id', c.course_id)
    FROM bookmarks b
    JOIN courses c ON c.course_id = b.target_id
    WHERE b.user_id = $1 AND b.target_type = 'course' AND c.status = 'active'

    UNION ALL

    SELECT 'bookmark_spot', b.bookmark_id, s.name, b.created_at,
           jsonb_build_object('spot_id', s.spot_id)
    FROM bookmarks b
    JOIN spots s ON s.spot_id = b.target_id
    WHERE b.user_id = $1 AND b.target_type = 'spot' AND s.status = 'active'
  )
`;

exports.getHistory = async (userId, query) => {
  const { page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `${HISTORY_CTE}
     SELECT * FROM history
     ORDER BY occurred_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, +limit, +offset]
  );

  const { rows: countRows } = await pool.query(
    `${HISTORY_CTE}
     SELECT COUNT(*) AS total FROM history`,
    [userId]
  );

  return { total: +countRows[0].total, page: +page, history: rows };
};
