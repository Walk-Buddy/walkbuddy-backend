const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course Detail Repository
//  코스 상세 정보: 경로 좌표 · 노드(핀+스팟) · 스팟 이미지/추천수 · 리뷰
// ─────────────────────────────────────────────────────────────────────

const CourseDetailRepository = {

  async findDetail(courseId) {
    // ── 1. 코스 기본 정보 + 경로 GeoJSON ─────────────────────────────
    const { rows: courseRows } = await pool.query(
      `SELECT c.course_id,
              c.title,
              c.description,
              c.creation_type,
              c.total_distance_km,
              c.estimated_minutes,
              c.difficulty,
              c.visibility,
              c.bookmark_count,
              c.avg_rating,
              c.created_at,
              c.updated_at,
              ST_AsGeoJSON(c.full_route)::json AS route
       FROM   courses c
       WHERE  c.course_id = $1
         AND  c.is_deleted = FALSE`,
      [courseId]
    );
    if (!courseRows[0]) return null;
    const course = courseRows[0];

    // ── 2. 경로 노드 전체 (핀 + 스팟) 순서대로 ───────────────────────
    const { rows: nodes } = await pool.query(
      `SELECT n.node_id,
              n.node_type,
              n.label,
              n.name,
              n.description,
              n.content_types,
              cp.node_order,
              ST_Y(n.location::geometry) AS latitude,
              ST_X(n.location::geometry) AS longitude
       FROM   nodes n
       JOIN   course_path cp ON cp.node_id = n.node_id
       WHERE  cp.course_id = $1
       ORDER  BY cp.node_order ASC`,
      [courseId]
    );

    // ── 3·4. 스팟에 대해서만: 이미지 + 추천수 병렬 조회 ──────────────
    const spotIds = nodes.filter(n => n.node_type === 'spot').map(n => n.node_id);

    let imageMap  = {};
    let reviewMap = {};

    if (spotIds.length > 0) {
      const [imageResult, reviewResult] = await Promise.all([
        pool.query(
          `SELECT node_id, image_url, caption, display_order
           FROM   spot_images
           WHERE  node_id = ANY($1)
           ORDER  BY node_id, display_order ASC`,
          [spotIds]
        ),
        pool.query(
          `SELECT node_id,
                  COUNT(*) FILTER (WHERE is_recommended = TRUE) AS recommend_count,
                  COUNT(*)                                       AS total_reviews
           FROM   spot_reviews
           WHERE  node_id = ANY($1)
           GROUP  BY node_id`,
          [spotIds]
        ),
      ]);

      for (const img of imageResult.rows) {
        if (!imageMap[img.node_id]) imageMap[img.node_id] = [];
        imageMap[img.node_id].push({
          image_url:     img.image_url,
          caption:       img.caption,
          display_order: img.display_order,
        });
      }

      for (const r of reviewResult.rows) {
        reviewMap[r.node_id] = {
          recommend_count: parseInt(r.recommend_count, 10),
          total_reviews:   parseInt(r.total_reviews, 10),
        };
      }
    }

    // ── 5. 코스 리뷰 최근 5개 ─────────────────────────────────────────
    const { rows: reviews } = await pool.query(
      `SELECT course_review_id,
              user_id,
              rating,
              content,
              created_at
       FROM   course_reviews
       WHERE  course_id  = $1
         AND  visibility = 'public'
       ORDER  BY created_at DESC
       LIMIT  5`,
      [courseId]
    );

    // ── 노드에 이미지 / 추천수 결합 ──────────────────────────────────
    const enrichedNodes = nodes.map(n => {
      if (n.node_type !== 'spot') return n;
      return {
        ...n,
        images:          imageMap[n.node_id]  || [],
        recommend_count: reviewMap[n.node_id]?.recommend_count ?? 0,
        total_reviews:   reviewMap[n.node_id]?.total_reviews   ?? 0,
      };
    });

    return {
      ...course,
      nodes:   enrichedNodes,
      reviews,
    };
  },
};

module.exports = CourseDetailRepository;
