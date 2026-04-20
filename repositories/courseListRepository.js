const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Course List Repository  (정렬 / 필터 / 페이지네이션)
// ─────────────────────────────────────────────────────────────────────

const SORT_MAP = {
  // 보조 정렬로 course_id 를 두어 동일 시각 삽입 건의 순서가 안정적이게 함
  latest:         'c.created_at DESC, c.course_id DESC',
  popularity:     'c.bookmark_count DESC, c.avg_rating DESC, c.course_id DESC',
  distance:       'c.total_distance_km ASC, c.course_id DESC',
  difficulty:     'c.difficulty ASC, c.course_id DESC',
  estimated_time: 'c.estimated_minutes ASC, c.course_id DESC',
};

const CourseListRepository = {

  /**
   * 코스 목록 조회 (정렬 / 필터 / 페이지네이션)
   * @param {object} opts
   * @param {string}  opts.sort           - latest | popularity | nearest | distance | difficulty | estimated_time
   * @param {number}  [opts.lat]          - 위도  (sort=nearest 필수)
   * @param {number}  [opts.lng]          - 경도  (sort=nearest 필수)
   * @param {number}  [opts.difficulty]   - 1~3
   * @param {number}  [opts.min_distance] - km
   * @param {number}  [opts.max_distance] - km
   * @param {number}  [opts.min_time]     - 분
   * @param {number}  [opts.max_time]     - 분
   * @param {string}  [opts.creation_type] - 'manual' | 'auto' (걷기길 CSV import 는 auto)
   * @param {number}  opts.page           - 1-based
   * @param {number}  opts.limit          - 페이지당 개수 (라우트에서 상한 적용, 예: 2000)
   * @returns {{ courses: object[], total: number }}
   */
  async findList({
    sort = 'latest',
    lat,
    lng,
    difficulty,
    min_distance,
    max_distance,
    min_time,
    max_time,
    creation_type,
    page = 1,
    limit = 10,
  }) {
    const offset = (page - 1) * limit;

    // ── WHERE 조건 빌드 ──────────────────────────────────────────────
    const conditions = [
      `c.is_deleted = FALSE`,
      `c.is_hidden  = FALSE`,
      `c.visibility = 'public'`,
    ];
    const whereValues = [];
    let idx = 1;

    if (creation_type !== undefined) {
      conditions.push(`c.creation_type = $${idx++}`);
      whereValues.push(creation_type);
    }

    if (difficulty !== undefined) {
      conditions.push(`c.difficulty = $${idx++}`);
      whereValues.push(difficulty);
    }
    if (min_distance !== undefined) {
      conditions.push(`c.total_distance_km >= $${idx++}`);
      whereValues.push(min_distance);
    }
    if (max_distance !== undefined) {
      conditions.push(`c.total_distance_km <= $${idx++}`);
      whereValues.push(max_distance);
    }
    if (min_time !== undefined) {
      conditions.push(`c.estimated_minutes >= $${idx++}`);
      whereValues.push(min_time);
    }
    if (max_time !== undefined) {
      conditions.push(`c.estimated_minutes <= $${idx++}`);
      whereValues.push(max_time);
    }

    const whereClause = conditions.join(' AND ');

    // ── ORDER BY 빌드 ────────────────────────────────────────────────
    let orderBy;
    const orderValues = [];

    if (sort === 'nearest') {
      // full_route가 NULL인 코스는 맨 뒤로
      orderBy = `ST_Distance(
                   c.full_route::geography,
                   ST_MakePoint($${idx}, $${idx + 1})::geography
                 ) ASC NULLS LAST, c.course_id DESC`;
      orderValues.push(lng, lat);   // ST_MakePoint(경도, 위도) 순서
      idx += 2;
    } else {
      orderBy = SORT_MAP[sort] || SORT_MAP.latest;
    }

    // ── LIMIT / OFFSET 파라미터 인덱스 ──────────────────────────────
    const limitIdx  = idx;
    const offsetIdx = idx + 1;

    const dataValues  = [...whereValues, ...orderValues, limit, offset];
    const countValues = whereValues;

    const dataQuery = `
  SELECT c.*,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT('tag_id', mt.tag_id, 'tag_name', mt.tag_name, 'category', mt.category)
      ) FILTER (WHERE mt.tag_id IS NOT NULL),
      '[]'
    ) AS tags
  FROM courses c
  LEFT JOIN course_tags ct ON ct.course_id = c.course_id
  LEFT JOIN master_tags mt ON mt.tag_id = ct.tag_id
  WHERE ${whereClause}
  GROUP BY c.course_id
  ORDER BY ${orderBy}
  LIMIT $${limitIdx}
  OFFSET $${offsetIdx}
`;
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM   courses c
      WHERE  ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataValues),
      pool.query(countQuery, countValues),
    ]);

    return {
      courses: dataResult.rows,
      total:   parseInt(countResult.rows[0].total, 10),
    };
  },
};

module.exports = CourseListRepository;
