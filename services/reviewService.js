const pool = require('../config/db');

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

// ──────────────────────────────────────────────────────────────────────
// 코스 후기 등록
// ──────────────────────────────────────────────────────────────────────
exports.createCourseReview = async (userId, courseId, body) => {
  const { walk_record_id, description, difficulty, rating, is_public = true, tag_ids = [] } = body;

  // walk_record_id 유효성 확인 (본인 산책 기록 + 해당 코스)
  const { rows: walkRows } = await pool.query(
    `SELECT walk_record_id FROM walk_records
     WHERE walk_record_id = $1 AND user_id = $2 AND course_id = $3 AND ended_at IS NOT NULL`,
    [walk_record_id, userId, courseId]
  );
  if (!walkRows.length) {
    const err = new Error('유효한 산책 기록이 없습니다.');
    err.status = 400; throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [review] } = await client.query(
      `INSERT INTO course_reviews
         (user_id, course_id, walk_record_id, description, difficulty, rating, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING course_review_id, course_id, rating, created_at`,
      [userId, courseId, walk_record_id, description || null, difficulty || null, rating || null, is_public]
    );

    // 태그 저장
    if (tag_ids.length) {
      const { rows: validTags } = await client.query(
        `SELECT tag_id FROM tags WHERE tag_id = ANY($1::uuid[]) AND type = 'course' AND is_active = TRUE`,
        [tag_ids]
      );
      for (const { tag_id } of validTags) {
        await client.query(
          `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
           VALUES ($1, $2, 'course', $3) ON CONFLICT DO NOTHING`,
          [tag_id, courseId, userId]
        );
      }
    }

    await client.query('COMMIT');
    return review;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ──────────────────────────────────────────────────────────────────────
// 코스 후기 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getCourseReviews = async (courseId, query, userId) => {
  const { page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT
       cr.course_review_id, cr.description, cr.difficulty, cr.rating,
       cr.is_public, cr.created_at,
       json_build_object(
         'user_id',   u.user_id,
         'nickname',  u.nickname,
         'profile_image_url', u.profile_image_url
       ) AS user,
       COALESCE(
         json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
         FILTER (WHERE t.tag_id IS NOT NULL), '[]'
       ) AS tags,
       COUNT(DISTINCT r_like.user_id) AS like_count,
       COUNT(DISTINCT r_dislike.user_id) AS dislike_count,
       MAX(my_r.reaction) AS my_reaction
     FROM course_reviews cr
     JOIN users u ON u.user_id = cr.user_id
     LEFT JOIN taggings tg ON tg.target_id = cr.course_id AND tg.target_type = 'course' AND tg.user_id = cr.user_id
     LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
     LEFT JOIN reactions r_like ON r_like.target_id = cr.course_review_id AND r_like.target_type = 'course_review' AND r_like.reaction = 'like'
     LEFT JOIN reactions r_dislike ON r_dislike.target_id = cr.course_review_id AND r_dislike.target_type = 'course_review' AND r_dislike.reaction = 'dislike'
     LEFT JOIN reactions my_r ON my_r.target_id = cr.course_review_id AND my_r.target_type = 'course_review' AND my_r.user_id = $4
     WHERE cr.course_id = $1 AND cr.status = 'active' AND cr.is_public = TRUE
     GROUP BY cr.course_review_id, u.user_id
     ORDER BY cr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [courseId, +limit, +offset, userId || null]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM course_reviews
     WHERE course_id = $1 AND status = 'active' AND is_public = TRUE`,
    [courseId]
  );

  return { total: +countRows[0].total, reviews: rows };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 후기 등록
// ──────────────────────────────────────────────────────────────────────
exports.createSpotReview = async (userId, spotId, body, files = []) => {
  const { walk_record_id, description } = body;
  const is_recommended = isMissing(body.is_recommended) ? null : body.is_recommended === 'true' || body.is_recommended === true;
  const is_public = isMissing(body.is_public) ? true : body.is_public === 'true' || body.is_public === true;
  const tag_ids = isMissing(body.tag_ids) ? [] : [].concat(body.tag_ids);

  // 업로드된 사진 파일 → S3 key 배열
  const photos = (files || []).map((file) => file.key);

  // walk_record_id 유효성 확인
  const { rows: walkRows } = await pool.query(
    `SELECT walk_record_id FROM walk_records
     WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NOT NULL`,
    [walk_record_id, userId]
  );
  if (!walkRows.length) {
    const err = new Error('유효한 산책 기록이 없습니다.');
    err.status = 400; throw err;
  }

  if (photos.length > 5) {
    const err = new Error('사진은 최대 5장까지 첨부 가능합니다.');
    err.status = 400; throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [review] } = await client.query(
      `INSERT INTO spot_reviews
         (user_id, spot_id, walk_record_id, description, is_recommended, photos, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING spot_review_id, spot_id, is_recommended, created_at`,
      [userId, spotId, walk_record_id, description || null,
       is_recommended ?? null, photos.length ? photos : null, is_public]
    );

    // 태그 저장
    if (tag_ids.length) {
      const { rows: validTags } = await client.query(
        `SELECT tag_id FROM tags WHERE tag_id = ANY($1::uuid[]) AND type = 'spot' AND is_active = TRUE`,
        [tag_ids]
      );
      for (const { tag_id } of validTags) {
        await client.query(
          `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
           VALUES ($1, $2, 'spot', $3) ON CONFLICT DO NOTHING`,
          [tag_id, spotId, userId]
        );
      }
    }

    // 추천도 업데이트
    await client.query(
      `UPDATE spots
       SET recommend_pct = (
         SELECT ROUND(
           COUNT(*) FILTER (WHERE is_recommended = TRUE) * 100.0 / COUNT(*), 2
         )
         FROM spot_reviews
         WHERE spot_id = $1 AND status = 'active'
       )
       WHERE spot_id = $1`,
      [spotId]
    );

    // 연결 코스 자동 태그: 이 후기가 작성된 산책이 특정 코스를 걷던 중이었다면
    // 어떤 코스와 연결된 후기인지 자동으로 표시 (사용자가 직접 입력하지 않음)
    const { rows: [linked] } = await client.query(
      `SELECT c.course_id, c.name,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
              ) AS tags
       FROM walk_records wr
       JOIN courses c ON c.course_id = wr.course_id
       LEFT JOIN taggings tg ON tg.target_id = c.course_id AND tg.target_type = 'course'
       LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
       WHERE wr.walk_record_id = $1
       GROUP BY c.course_id`,
      [walk_record_id]
    );

    await client.query('COMMIT');
    return { ...review, linked_course: linked || null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 후기 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpotReviews = async (spotId, query, userId) => {
  const { page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT
       sr.spot_review_id, sr.description, sr.is_recommended,
       sr.photos, sr.is_public, sr.created_at,
       json_build_object(
         'user_id',  u.user_id,
         'nickname', u.nickname,
         'profile_image_url', u.profile_image_url
       ) AS user,
       COALESCE(
         json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
         FILTER (WHERE t.tag_id IS NOT NULL), '[]'
       ) AS tags,
       CASE WHEN lc.course_id IS NOT NULL
         THEN jsonb_build_object('course_id', lc.course_id, 'name', lc.name)
       END AS linked_course,
       COUNT(DISTINCT r_like.user_id) AS like_count,
       COUNT(DISTINCT r_dislike.user_id) AS dislike_count,
       MAX(my_r.reaction) AS my_reaction
     FROM spot_reviews sr
     JOIN users u ON u.user_id = sr.user_id
     LEFT JOIN walk_records wr ON wr.walk_record_id = sr.walk_record_id
     LEFT JOIN courses lc ON lc.course_id = wr.course_id
     LEFT JOIN taggings tg ON tg.target_id = sr.spot_id AND tg.target_type = 'spot' AND tg.user_id = sr.user_id
     LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
     LEFT JOIN reactions r_like ON r_like.target_id = sr.spot_review_id AND r_like.target_type = 'spot_review' AND r_like.reaction = 'like'
     LEFT JOIN reactions r_dislike ON r_dislike.target_id = sr.spot_review_id AND r_dislike.target_type = 'spot_review' AND r_dislike.reaction = 'dislike'
     LEFT JOIN reactions my_r ON my_r.target_id = sr.spot_review_id AND my_r.target_type = 'spot_review' AND my_r.user_id = $4
     WHERE sr.spot_id = $1 AND sr.status = 'active' AND sr.is_public = TRUE
     GROUP BY sr.spot_review_id, u.user_id, lc.course_id, lc.name
     ORDER BY sr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [spotId, +limit, +offset, userId || null]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM spot_reviews
     WHERE spot_id = $1 AND status = 'active' AND is_public = TRUE`,
    [spotId]
  );

  return { total: +countRows[0].total, reviews: rows };
};

// ──────────────────────────────────────────────────────────────────────
// 나의 후기 목록 (코스 후기 + 스팟 후기 통합, 마이페이지)
// ──────────────────────────────────────────────────────────────────────
exports.getMyReviews = async (userId, query) => {
  const { page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const unionSql = `
    SELECT 'course' AS review_type, cr.course_review_id AS review_id,
           cr.course_id AS target_id, c.name AS target_name,
           cr.description, cr.rating, cr.difficulty, NULL::boolean AS is_recommended,
           NULL::text[] AS photos, cr.is_public, cr.created_at
    FROM course_reviews cr
    JOIN courses c ON c.course_id = cr.course_id
    WHERE cr.user_id = $1 AND cr.status = 'active'

    UNION ALL

    SELECT 'spot' AS review_type, sr.spot_review_id AS review_id,
           sr.spot_id AS target_id, s.name AS target_name,
           sr.description, NULL::decimal AS rating, NULL::varchar AS difficulty, sr.is_recommended,
           sr.photos, sr.is_public, sr.created_at
    FROM spot_reviews sr
    JOIN spots s ON s.spot_id = sr.spot_id
    WHERE sr.user_id = $1 AND sr.status = 'active'
  `;

  const { rows } = await pool.query(
    `${unionSql} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, +limit, +offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM (${unionSql}) reviews`,
    [userId]
  );

  return { total: +countRows[0].total, page: +page, reviews: rows };
};

// ──────────────────────────────────────────────────────────────────────
// 후기 수정 (코스/스팟 공통)
// ──────────────────────────────────────────────────────────────────────
exports.updateReview = async (userId, reviewType, reviewId, body) => {
  const { description, difficulty, rating, is_recommended, is_public } = body;

  if (reviewType === 'course') {
    const { rows: [updated] } = await pool.query(
      `UPDATE course_reviews
       SET description = COALESCE($1, description),
           difficulty  = COALESCE($2, difficulty),
           rating      = COALESCE($3, rating),
           is_public   = COALESCE($4, is_public),
           updated_at  = NOW()
       WHERE course_review_id = $5 AND user_id = $6 AND status = 'active'
       RETURNING course_review_id AS review_id, updated_at`,
      [description ?? null, difficulty ?? null, rating ?? null, is_public ?? null, reviewId, userId]
    );
    if (!updated) {
      const err = new Error('후기를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    return updated;
  }

  if (reviewType === 'spot') {
    const { rows: [updated] } = await pool.query(
      `UPDATE spot_reviews
       SET description    = COALESCE($1, description),
           is_recommended = COALESCE($2, is_recommended),
           is_public      = COALESCE($3, is_public),
           updated_at     = NOW()
       WHERE spot_review_id = $4 AND user_id = $5 AND status = 'active'
       RETURNING spot_review_id AS review_id, updated_at`,
      [description ?? null, is_recommended ?? null, is_public ?? null, reviewId, userId]
    );
    if (!updated) {
      const err = new Error('후기를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    return updated;
  }

  const err = new Error('유효하지 않은 review_type입니다.'); err.status = 400; throw err;
};

// ──────────────────────────────────────────────────────────────────────
// 후기 삭제 (코스/스팟 공통)
// ──────────────────────────────────────────────────────────────────────
exports.deleteReview = async (userId, reviewType, reviewId) => {
  if (reviewType === 'course') {
    const { rows } = await pool.query(
      `UPDATE course_reviews SET status = 'hidden', updated_at = NOW()
       WHERE course_review_id = $1 AND user_id = $2 AND status = 'active'
       RETURNING course_review_id`,
      [reviewId, userId]
    );
    if (!rows.length) {
      const err = new Error('후기를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    return { message: '삭제되었습니다.' };
  }

  if (reviewType === 'spot') {
    const { rows } = await pool.query(
      `UPDATE spot_reviews SET status = 'hidden', updated_at = NOW()
       WHERE spot_review_id = $1 AND user_id = $2 AND status = 'active'
       RETURNING spot_review_id`,
      [reviewId, userId]
    );
    if (!rows.length) {
      const err = new Error('후기를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    return { message: '삭제되었습니다.' };
  }

  const err = new Error('유효하지 않은 review_type입니다.'); err.status = 400; throw err;
};