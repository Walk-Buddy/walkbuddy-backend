const pool = require('../config/db');

const WALK_SPEED_MPS = 1.1; // 도보 평균 4km/h

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: spot_id 배열 → { spot_id: { lat, lng } } 맵
// ──────────────────────────────────────────────────────────────────────
const fetchSpotCoords = async (spotIds, client) => {
  if (!spotIds.length) return {};
  const { rows } = await client.query(
    `SELECT spot_id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM spots WHERE spot_id = ANY($1::uuid[]) AND status = 'active'`,
    [spotIds]
  );
  const map = {};
  rows.forEach((r) => { map[r.spot_id] = { lat: +r.lat, lng: +r.lng }; });
  const missing = spotIds.filter((id) => !map[id]);
  if (missing.length) {
    const err = new Error(`존재하지 않거나 비활성 스팟: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return map;
};

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: waypoints → WKT LINESTRING
// ──────────────────────────────────────────────────────────────────────
const buildLineString = async (waypoints, client) => {
  const spotIds = waypoints.filter((w) => w.type === 'spot').map((w) => w.spot_id);
  const coords = await fetchSpotCoords(spotIds, client);
  const points = waypoints.map((w) =>
    w.type === 'spot'
      ? `${coords[w.spot_id].lng} ${coords[w.spot_id].lat}`
      : `${w.lng} ${w.lat}`
  );
  return `SRID=4326;LINESTRING(${points.join(', ')})`;
};

// ──────────────────────────────────────────────────────────────────────
// 내부 헬퍼: WKT → 총 거리(m) + 예상 소요 시간(분)
// ──────────────────────────────────────────────────────────────────────
const calcStats = async (wkt, client) => {
  const { rows } = await client.query(
    `SELECT ST_Length($1::geography) AS dist`, [wkt]
  );
  const totalDistance = Math.round(+rows[0].dist);
  const estimatedDuration = Math.ceil(totalDistance / WALK_SPEED_MPS / 60);
  return { totalDistance, estimatedDuration };
};

// ──────────────────────────────────────────────────────────────────────
// 태그 처리 공통 함수
// ──────────────────────────────────────────────────────────────────────
const insertTags = async (tagIds, courseId, userId, client) => {
  if (!tagIds.length) return;
  const { rows: validTags } = await client.query(
    `SELECT tag_id FROM tags WHERE tag_id = ANY($1::uuid[]) AND type = 'course' AND is_active = TRUE`,
    [tagIds]
  );
  for (const { tag_id } of validTags)
    await client.query(
      `INSERT INTO taggings (tag_id, target_id, target_type, user_id) VALUES ($1,$2,'course',$3) ON CONFLICT DO NOTHING`,
      [tag_id, courseId, userId]
    );
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIFFICULTY_ALIASES = {
  easy: 'easy',
  normal: 'normal',
  medium: 'normal',
  hard: 'hard',
};

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function createBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function readQueryValue(...values) {
  const value = values.find((item) => !isMissing(item));
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value, name, { required = false, min = null, max = null } = {}) {
  if (isMissing(value)) {
    if (required) throw createBadRequest(`${name} query parameter is required`);
    return null;
  }

  const numberValue = Number(Array.isArray(value) ? value[0] : value);

  if (!Number.isFinite(numberValue)) {
    throw createBadRequest(`${name} must be a valid number`);
  }

  if (min !== null && numberValue < min) {
    throw createBadRequest(`${name} must be greater than or equal to ${min}`);
  }

  if (max !== null && numberValue > max) {
    throw createBadRequest(`${name} must be less than or equal to ${max}`);
  }

  return numberValue;
}

function parseIntegerParam(value, name, { defaultValue, min, max }) {
  const numberValue = isMissing(value) ? defaultValue : Number(Array.isArray(value) ? value[0] : value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw createBadRequest(`${name} must be an integer between ${min} and ${max}`);
  }

  return numberValue;
}

function parseUuidList(value, name) {
  if (isMissing(value)) return [];

  const rawValue = Array.isArray(value) ? value.join(',') : value;
  const uuidList = rawValue
    .split(',')
    .map((tagId) => tagId.trim())
    .filter(Boolean);

  if (uuidList.some((tagId) => !UUID_PATTERN.test(tagId))) {
    throw createBadRequest(`${name} must be comma-separated UUID values`);
  }

  return uuidList;
}

function normalizeDifficulty(value) {
  if (isMissing(value)) return null;

  const normalized = DIFFICULTY_ALIASES[String(value).toLowerCase()];
  if (!normalized) {
    throw createBadRequest('difficulty must be one of easy, normal, medium, hard');
  }

  return normalized;
}

// 두루누비 description 문자열을 파싱하는 함수
// 예: "@@summary\n- ..." 형태를 { summary: [...] } 형태로 변환합니다.

function parseDescriptionSections(description){
  const sections={
    summary: [],
    content: null,
    tour_info:[],
    traveler_info:[],
    stamp_location: null,
    region: null,
    cycle:null,

  };

  //description이 없으면 빈 sections 반환
  if(!description) return sections;
  
  const blocks = description
  .split(/\n(?=@@)/)
  .map((block)=>block.trim())
  .filter(Boolean);

  for(const block of blocks)
  {
    const [firstLine, ...bodyLines]=block.split('\n');
    const key=firstLine.replace(/^@@/,'').trim();
    const body=bodyLines.join('\n').trim();

    if(key==='summary'){
      sections.summary = parseListLines(body);
    }
    if(key==='content'){
      sections.content=body||null;
    }
     if (key === 'tour_info') {
      sections.tour_info = parseListLines(body);
    }
    if(key==='traveler_info'){
      const{list,stampLocation}=parseTravelerInfo(body);
      sections.traveler_info=list;
      sections.stamp_location=stampLocation;
    }
    if(key==='region'){
      sections.region=body||null;
    }
    if(key==='cycle'){
      sections.cycle=body||null;
    }
  }
  
  return sections;
}

function parseListLines(text){
  if(!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
} 

function parseTravelerInfo(text){
  if(!text) {
    return{list:[],stampLocation:null};
  }

  const stampMatch=text.match(/\*\s*[^\n]*스탬프함 위치\n([\s\S]*)/);

  const travelerText=stampMatch
  ?text.slice(0,stampMatch.index).trim()
  : text.trim();

  return{
    list:parseListLines(travelerText),
    stampLocation:stampMatch? stampMatch[1].trim():null,
  };
}

function buildCourseDetailDescription(course) {
  if (course.data_source !== '한국관광공사_두루누비') {
    return {
      description: course.description,
    };
  }

  const sections = parseDescriptionSections(course.description);

  return {
    description: sections.summary.join('\n') || sections.content || course.description,
    description_sections: sections,
  };
}

// ──────────────────────────────────────────────────────────────────────
// 코스 미리보기 (저장 없이 거리·시간·경로 계산)
// ──────────────────────────────────────────────────────────────────────
exports.previewCourse = async (waypoints) => {
  const client = await pool.connect();
  try {
    const wkt = await buildLineString(waypoints, client);
    const { totalDistance, estimatedDuration } = await calcStats(wkt, client);
    const { rows } = await client.query(
      `SELECT ST_AsGeoJSON($1::geography)::json AS geojson`, [wkt]
    );
    return {
      geojson: rows[0].geojson,
      total_distance: totalDistance,
      estimated_duration: estimatedDuration,
    };
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 수동 코스 생성
// waypoints: [{ type: 'spot', spot_id }, { type: 'pin', lat, lng }]
// ──────────────────────────────────────────────────────────────────────
exports.createCourse = async (userId, body) => {
  const { name, description, category, is_public = true, tag_ids = [], waypoints } = body;

  for (const [i, w] of waypoints.entries()) {
    if (w.type === 'spot' && !w.spot_id) {
      const err = new Error(`waypoints[${i}]: spot 타입은 spot_id가 필수입니다.`);
      err.status = 400; throw err;
    }
    if (w.type === 'pin' && (w.lat == null || w.lng == null)) {
      const err = new Error(`waypoints[${i}]: pin 타입은 lat, lng가 필수입니다.`);
      err.status = 400; throw err;
    }
    if (!['spot', 'pin'].includes(w.type)) {
      const err = new Error(`waypoints[${i}]: type은 'spot' 또는 'pin'이어야 합니다.`);
      err.status = 400; throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const wkt = await buildLineString(waypoints, client);
    const { totalDistance, estimatedDuration } = await calcStats(wkt, client);

    const { rows: [course] } = await client.query(
      `INSERT INTO courses (owner_id, name, description, category, route_geometry, total_distance, estimated_duration, is_public)
       VALUES ($1,$2,$3,$4,$5::geography,$6,$7,$8)
       RETURNING course_id, name, total_distance, estimated_duration, is_public, created_at`,
      [userId, name, description || null, category || null, wkt, totalDistance, estimatedDuration, is_public]
    );

    for (const [i, w] of waypoints.entries()) {
      if (w.type === 'spot')
        await client.query(
          `INSERT INTO course_waypoints (course_id, seq, type, spot_id) VALUES ($1,$2,'spot',$3)`,
          [course.course_id, i + 1, w.spot_id]
        );
      else
        await client.query(
          `INSERT INTO course_waypoints (course_id, seq, type, lat, lng) VALUES ($1,$2,'pin',$3,$4)`,
          [course.course_id, i + 1, w.lat, w.lng]
        );
    }

    await insertTags(tag_ids, course.course_id, userId, client);

    // 경로 근처 스팟 자동 감지 (반경 50m)
    const existingSpotIds = waypoints.filter((w) => w.type === 'spot').map((w) => w.spot_id);
    const { rows: nearby } = await client.query(
      `SELECT spot_id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM spots WHERE status = 'active'
         AND ST_DWithin(location, $1::geography, 50)
         AND ($2::uuid[] IS NULL OR spot_id <> ALL($2::uuid[]))`,
      [wkt, existingSpotIds.length ? existingSpotIds : null]
    );

    await client.query('COMMIT');
    return { ...course, waypoints_count: waypoints.length, nearby_spots_suggestion: nearby };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 자동 코스 생성 (GPS 기록 기반)
// walk_records.actual_route → courses INSERT
// ──────────────────────────────────────────────────────────────────────
exports.createCourseFromWalk = async (userId, body) => {
  const { walk_record_id, name, description, is_public = true, tag_ids = [] } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 종료된 산책 기록 조회
    const { rows } = await client.query(
      `SELECT actual_route, total_distance, duration
       FROM walk_records
       WHERE walk_record_id = $1 AND user_id = $2 AND ended_at IS NOT NULL`,
      [walk_record_id, userId]
    );
    if (!rows.length) {
      const err = new Error('종료된 산책 기록을 찾을 수 없습니다.');
      err.status = 404; throw err;
    }

    const { actual_route, total_distance, duration } = rows[0];

    if (!actual_route) {
      const err = new Error('GPS 경로 데이터가 없습니다.');
      err.status = 400; throw err;
    }

    const { rows: [course] } = await client.query(
      `INSERT INTO courses (owner_id, name, description, route_geometry, total_distance, estimated_duration, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING course_id, name, total_distance, estimated_duration, is_public, created_at`,
      [userId, name, description || null, actual_route, total_distance, Math.ceil(duration), is_public]
    );

    await insertTags(tag_ids, course.course_id, userId, client);

    await client.query('COMMIT');
    return course;
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 코스 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getCourses = async (query) => {
  const {
    lat, lng, radius = 5000,
    page = 1, limit = 20,
    sort = 'distance',        // distance | rating | latest
    is_public,
  } = query;

  const offset = (page - 1) * limit;
  const client = await pool.connect();
  try {
    const conditions = [`c.status = 'active'`, `c.is_public=TRUE`];
    const params = [];
    let idx = 1;

    if (is_public !== undefined) {
      conditions.push(`c.is_public = $${idx++}`);
      params.push(is_public === 'true');
    }

    // 위치 기반 반경 필터
    let distanceSelect = 'NULL::float AS distance';
    if (lat && lng) {
      distanceSelect = `ST_Distance(c.route_geometry, ST_Point($${idx},$${idx+1})::geography) AS distance`;
      conditions.push(`ST_DWithin(c.route_geometry, ST_Point($${idx},$${idx+1})::geography, $${idx+2})`);
      params.push(+lng, +lat, +radius);
      idx += 3;
    }

    const orderMap = {
      distance: lat && lng ? 'distance ASC' : 'c.created_at DESC',
      rating:   'avg_rating DESC NULLS LAST',
      latest:   'c.created_at DESC',
    };
    const orderBy = orderMap[sort] || 'c.created_at DESC';

    const sql = `
      SELECT
        c.course_id, c.name, c.description, c.category,
        c.total_distance, c.estimated_duration,
        c.is_public, c.created_at,
        ${distanceSelect},
        ROUND(AVG(cr.rating)::numeric, 1)          AS avg_rating,
        ROUND(AVG(CASE cr.difficulty
          WHEN 'easy'   THEN 1
          WHEN 'normal' THEN 2
          WHEN 'hard'   THEN 3 END)::numeric, 1)   AS avg_difficulty,
        COUNT(DISTINCT cr.course_review_id)         AS review_count,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
          FILTER (WHERE t.tag_id IS NOT NULL), '[]'
        ) AS tags
      FROM courses c
      LEFT JOIN course_reviews cr
        ON cr.course_id = c.course_id AND cr.status = 'active'
      LEFT JOIN taggings tg
        ON tg.target_id = c.course_id AND tg.target_type = 'course'
      LEFT JOIN tags t
        ON t.tag_id = tg.tag_id AND t.is_active = TRUE
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.course_id
      ORDER BY ${orderBy}
      LIMIT $${idx} OFFSET $${idx+1}
    `;
    params.push(+limit, +offset);

    const countSql = `
      SELECT COUNT(DISTINCT c.course_id) AS total
      FROM courses c
      WHERE ${conditions.join(' AND ')}
    `;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)), // limit/offset 제외
    ]);

    return {
      total: +countRows[0].total,
      page: +page,
      courses: rows,
    };
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 코스 검색
// 기준 좌표 반경, 거리/시간, 후기 기반 난이도·평점, 코스 태그, 포함 스팟 태그로 필터링
// ──────────────────────────────────────────────────────────────────────
exports.searchCourses = async (query) => {
  const lng = parseNumberParam(readQueryValue(query.x, query.lng), 'x', { required: true });
  const lat = parseNumberParam(readQueryValue(query.y, query.lat), 'y', { required: true });
  const radius = parseNumberParam(query.radius, 'radius', { min: 1 }) ?? 5000;
  const minTotalDistance = parseNumberParam(query.min_total_distance, 'min_total_distance', { min: 0 });
  const maxTotalDistance = parseNumberParam(query.max_total_distance, 'max_total_distance', { min: 0 });
  const minEstimatedDuration = parseNumberParam(query.min_estimated_duration, 'min_estimated_duration', { min: 0 });
  const maxEstimatedDuration = parseNumberParam(query.max_estimated_duration, 'max_estimated_duration', { min: 0 });
  const minAvgRating = parseNumberParam(query.min_avg_rating, 'min_avg_rating', { min: 0, max: 5 });
  const difficulty = normalizeDifficulty(query.difficulty);
  const courseTagIds = parseUuidList(query.course_tag_ids ?? query.tag_ids, 'course_tag_ids');
  const spotTagIds = parseUuidList(query.spot_tag_ids, 'spot_tag_ids');
  const page = parseIntegerParam(query.page, 'page', { defaultValue: 1, min: 1, max: 10000 });
  const limit = parseIntegerParam(query.limit, 'limit', { defaultValue: 20, min: 1, max: 100 });
  const offset = (page - 1) * limit;

  if (maxTotalDistance !== null && minTotalDistance !== null && maxTotalDistance < minTotalDistance) {
    throw createBadRequest('max_total_distance must be greater than or equal to min_total_distance');
  }

  if (maxEstimatedDuration !== null && minEstimatedDuration !== null && maxEstimatedDuration < minEstimatedDuration) {
    throw createBadRequest('max_estimated_duration must be greater than or equal to min_estimated_duration');
  }

  const params = [];
  const conditions = [`c.status = 'active'`, `c.is_public = TRUE`];

  params.push(lng);
  const lngParamIndex = params.length;
  params.push(lat);
  const latParamIndex = params.length;
  params.push(radius);
  const radiusParamIndex = params.length;

  const referencePointSql = `ST_Point($${lngParamIndex}, $${latParamIndex})::geography`;
  const distanceSelectSql = `ST_Distance(c.route_geometry, ${referencePointSql}) AS distance`;

  conditions.push(`ST_DWithin(c.route_geometry, ${referencePointSql}, $${radiusParamIndex})`);

  if (minTotalDistance !== null) {
    params.push(minTotalDistance);
    conditions.push(`c.total_distance >= $${params.length}`);
  }

  if (maxTotalDistance !== null) {
    params.push(maxTotalDistance);
    conditions.push(`c.total_distance <= $${params.length}`);
  }

  if (minEstimatedDuration !== null) {
    params.push(minEstimatedDuration);
    conditions.push(`c.estimated_duration >= $${params.length}`);
  }

  if (maxEstimatedDuration !== null) {
    params.push(maxEstimatedDuration);
    conditions.push(`c.estimated_duration <= $${params.length}`);
  }

  if (difficulty !== null) {
    params.push(difficulty);
    conditions.push(`rs.difficulty = $${params.length}`);
  }

  if (minAvgRating !== null) {
    params.push(minAvgRating);
    conditions.push(`rs.avg_rating >= $${params.length}`);
  }

  if (courseTagIds.length > 0) {
    params.push(courseTagIds);
    const tagIdsParamIndex = params.length;
    params.push(courseTagIds.length);
    const tagCountParamIndex = params.length;

    conditions.push(`
      c.course_id IN (
        SELECT tg.target_id
        FROM taggings tg
        JOIN tags t
          ON t.tag_id = tg.tag_id
         AND t.type = 'course'
         AND t.is_active = TRUE
        WHERE tg.target_type = 'course'
          AND tg.tag_id = ANY($${tagIdsParamIndex}::uuid[])
        GROUP BY tg.target_id
        HAVING COUNT(DISTINCT tg.tag_id) = $${tagCountParamIndex}
      )
    `);
  }

  if (spotTagIds.length > 0) {
    params.push(spotTagIds);
    const tagIdsParamIndex = params.length;
    params.push(spotTagIds.length);
    const tagCountParamIndex = params.length;

    // 장소 태그는 코스에 포함된 스팟들의 태그 합집합이 선택 태그를 모두 포함하는지로 판단합니다.
    conditions.push(`
      c.course_id IN (
        SELECT cw.course_id
        FROM course_waypoints cw
        JOIN taggings tg
          ON tg.target_type = 'spot'
         AND tg.target_id = cw.spot_id
        JOIN tags t
          ON t.tag_id = tg.tag_id
         AND t.type = 'spot'
         AND t.is_active = TRUE
        WHERE cw.type = 'spot'
          AND tg.tag_id = ANY($${tagIdsParamIndex}::uuid[])
        GROUP BY cw.course_id
        HAVING COUNT(DISTINCT tg.tag_id) = $${tagCountParamIndex}
      )
    `);
  }

  const sort = readQueryValue(query.sort) || 'distance';
  const orderMap = {
    distance: 'distance ASC',
    rating: 'rs.avg_rating DESC NULLS LAST, distance ASC',
    latest: 'c.created_at DESC',
    length: 'c.total_distance ASC, distance ASC',
    duration: 'c.estimated_duration ASC, distance ASC',
  };
  const orderBySql = orderMap[sort] || orderMap.distance;

  const baseSql = `
    WITH review_source AS (
      SELECT
        course_id,
        rating,
        CASE difficulty
          WHEN 'easy' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'hard' THEN 3
        END AS difficulty_score
      FROM course_reviews
      WHERE status = 'active'
    ),
    review_stats AS (
      SELECT
        course_id,
        ROUND(AVG(rating)::numeric, 1) AS avg_rating,
        ROUND(AVG(difficulty_score)::numeric, 1) AS avg_difficulty_score,
        CASE
          WHEN AVG(difficulty_score) IS NULL THEN NULL
          WHEN AVG(difficulty_score) < 1.5 THEN 'easy'
          WHEN AVG(difficulty_score) < 2.5 THEN 'normal'
          ELSE 'hard'
        END AS difficulty,
        COUNT(*) AS review_count
      FROM review_source
      GROUP BY course_id
    ),
    course_tag_agg AS (
      SELECT
        tg.target_id AS course_id,
        jsonb_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name)) AS course_tags
      FROM taggings tg
      JOIN tags t
        ON t.tag_id = tg.tag_id
       AND t.type = 'course'
       AND t.is_active = TRUE
      WHERE tg.target_type = 'course'
      GROUP BY tg.target_id
    ),
    spot_tag_agg AS (
      SELECT
        cw.course_id,
        jsonb_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name)) AS spot_tags
      FROM course_waypoints cw
      JOIN taggings tg
        ON tg.target_type = 'spot'
       AND tg.target_id = cw.spot_id
      JOIN tags t
        ON t.tag_id = tg.tag_id
       AND t.type = 'spot'
       AND t.is_active = TRUE
      WHERE cw.type = 'spot'
      GROUP BY cw.course_id
    )
  `;

  const fromSql = `
    FROM courses c
    LEFT JOIN review_stats rs
      ON rs.course_id = c.course_id
    LEFT JOIN course_tag_agg ct
      ON ct.course_id = c.course_id
    LEFT JOIN spot_tag_agg st
      ON st.course_id = c.course_id
    WHERE ${conditions.join(' AND ')}
  `;

  const listParams = [...params, limit, offset];
  const limitParamIndex = params.length + 1;
  const offsetParamIndex = params.length + 2;

  const listSql = `
    ${baseSql}
    SELECT
      c.course_id,
      c.name,
      c.description,
      c.category,
      c.total_distance,
      c.estimated_duration,
      c.is_public,
      c.created_at,
      ${distanceSelectSql},
      rs.avg_rating,
      rs.avg_difficulty_score,
      rs.difficulty,
      COALESCE(rs.review_count, 0) AS review_count,
      COALESCE(ct.course_tags, '[]'::jsonb) AS course_tags,
      COALESCE(st.spot_tags, '[]'::jsonb) AS spot_tags
    ${fromSql}
    ORDER BY ${orderBySql}
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;

  const countSql = `
    ${baseSql}
    SELECT COUNT(*) AS total
    ${fromSql}
  `;

  const client = await pool.connect();
  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query(listSql, listParams),
      client.query(countSql, params),
    ]);

    const courses = rows.map((course) => {
      const courseTags = course.course_tags || [];

      return {
        ...course,
        distance: course.distance === null ? null : Number(course.distance),
        avg_rating: course.avg_rating === null ? null : Number(course.avg_rating),
        avg_difficulty_score: course.avg_difficulty_score === null
          ? null
          : Number(course.avg_difficulty_score),
        review_count: Number(course.review_count),
        course_tags: courseTags,
        spot_tags: course.spot_tags || [],
        tags: courseTags,
      };
    });

    return {
      success: true,
      filters: {
        x: lng,
        y: lat,
        radius,
        min_total_distance: minTotalDistance,
        max_total_distance: maxTotalDistance,
        min_estimated_duration: minEstimatedDuration,
        max_estimated_duration: maxEstimatedDuration,
        difficulty,
        min_avg_rating: minAvgRating,
        course_tag_ids: courseTagIds,
        spot_tag_ids: spotTagIds,
      },
      total_count: Number(countRows[0].total),
      page,
      limit,
      courses,
    };
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 코스 상세 조회
// ──────────────────────────────────────────────────────────────────────
exports.getCourseById = async (courseId, userId) => {
  const client = await pool.connect();
  try {
    // 코스 기본 정보
    const { rows: [course] } = await client.query(
      `SELECT
         c.course_id, c.name, c.description, c.category,
         c.total_distance, c.estimated_duration,
         c.is_public, c.owner_id, c.data_source, c.created_at, c.updated_at,
         ST_AsGeoJSON(c.route_geometry)::json AS route,
         ROUND(AVG(cr.rating)::numeric, 1)        AS avg_rating,
         ROUND(AVG(CASE cr.difficulty
           WHEN 'easy'   THEN 1
           WHEN 'normal' THEN 2
           WHEN 'hard'   THEN 3 END)::numeric, 1) AS avg_difficulty,
         COUNT(DISTINCT cr.course_review_id)       AS review_count
       FROM courses c
       LEFT JOIN course_reviews cr
         ON cr.course_id = c.course_id AND cr.status = 'active'
       WHERE c.course_id = $1 AND c.status != 'deleted'
       GROUP BY c.course_id`,
      [courseId]
    );

    if (!course) {
      const err = new Error('코스를 찾을 수 없습니다.');
      err.status = 404; throw err;
    }

    // 비공개 코스 → 본인만 조회 가능
    if (!course.is_public && course.owner_id !== userId) {
      const err = new Error('접근 권한이 없습니다.');
      err.status = 403; throw err;
    }

    // 경유지(스팟) 목록
    const { rows: waypoints } = await client.query(
      `SELECT
         cw.seq, cw.type, cw.spot_id,
         cw.lat, cw.lng,
         s.name AS spot_name,
         ST_Y(s.location::geometry) AS spot_lat,
         ST_X(s.location::geometry) AS spot_lng,
         s.categories AS spot_categories
       FROM course_waypoints cw
       LEFT JOIN spots s ON s.spot_id = cw.spot_id
       WHERE cw.course_id = $1
       ORDER BY cw.seq`,
      [courseId]
    );

    // 구간별 도보 소요 시간 계산
    const spots = waypoints.map((w, i) => ({
      ...w,
      segment_duration: i > 0 ? calcSegmentDuration(waypoints[i - 1], w) : null,
    }));

    // 태그
    const { rows: tags } = await client.query(
      `SELECT t.tag_id, t.name
       FROM taggings tg
       JOIN tags t ON t.tag_id = tg.tag_id
       WHERE tg.target_id = $1 AND tg.target_type = 'course' AND t.is_active = TRUE`,
      [courseId]
    );

    // 북마크 여부 (로그인 시)
    let is_bookmarked = false;
    if (userId) {
      const { rows: bm } = await client.query(
        `SELECT 1 FROM bookmarks WHERE user_id=$1 AND target_id=$2 AND target_type='course'`,
        [userId, courseId]
      );
      is_bookmarked = bm.length > 0;
    }

    return { ...course,  ...buildCourseDetailDescription(course), waypoints: spots, tags, is_bookmarked };
  } finally { client.release(); }
};

// 구간별 도보 소요 시간 계산 (분)
function calcSegmentDuration(from, to) {
  const fromLat = from.type === 'spot' ? +from.spot_lat : +from.lat;
  const fromLng = from.type === 'spot' ? +from.spot_lng : +from.lng;
  const toLat   = to.type   === 'spot' ? +to.spot_lat   : +to.lat;
  const toLng   = to.type   === 'spot' ? +to.spot_lng   : +to.lng;

  // Haversine 간이 계산
  const R = 6371000;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(fromLat * Math.PI/180) * Math.cos(toLat * Math.PI/180) * Math.sin(dLng/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.ceil(dist / WALK_SPEED_MPS / 60);
}

// ──────────────────────────────────────────────────────────────────────
// 코스 수정
// ──────────────────────────────────────────────────────────────────────
exports.updateCourse = async (userId, courseId, body) => {
  const { name, description, category, is_public, tag_ids, waypoints } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 소유자 확인
    const { rows: [course] } = await client.query(
      `SELECT owner_id FROM courses WHERE course_id=$1 AND status != 'deleted'`,
      [courseId]
    );
    if (!course) {
      const err = new Error('코스를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    if (course.owner_id !== userId) {
      const err = new Error('수정 권한이 없습니다.'); err.status = 403; throw err;
    }

    // 경유지 변경 시 route_geometry 재계산
    let extraSets = '';
    let extraParams = [];
    let paramIdx = 5; // $1=name $2=description $3=category $4=is_public 이후

    if (waypoints) {
      const wkt = await buildLineString(waypoints, client);
      const { totalDistance, estimatedDuration } = await calcStats(wkt, client);
      extraSets = `, route_geometry=$${paramIdx}::geography, total_distance=$${paramIdx+1}, estimated_duration=$${paramIdx+2}`;
      extraParams = [wkt, totalDistance, estimatedDuration];
      paramIdx += 3;

      // 경유지 교체
      await client.query(`DELETE FROM course_waypoints WHERE course_id=$1`, [courseId]);
      for (const [i, w] of waypoints.entries()) {
        if (w.type === 'spot')
          await client.query(
            `INSERT INTO course_waypoints (course_id,seq,type,spot_id) VALUES($1,$2,'spot',$3)`,
            [courseId, i+1, w.spot_id]
          );
        else
          await client.query(
            `INSERT INTO course_waypoints (course_id,seq,type,lat,lng) VALUES($1,$2,'pin',$3,$4)`,
            [courseId, i+1, w.lat, w.lng]
          );
      }
    }

    const { rows: [updated] } = await client.query(
      `UPDATE courses
       SET name=$1, description=$2, category=$3, is_public=$4${extraSets}, updated_at=NOW()
       WHERE course_id=$${paramIdx}
       RETURNING course_id, name, total_distance, estimated_duration, updated_at`,
      [name, description ?? null, category ?? null, is_public ?? true, ...extraParams, courseId]
    );

    // 태그 교체
    if (tag_ids) {
      await client.query(
        `DELETE FROM taggings WHERE target_id=$1 AND target_type='course'`, [courseId]
      );
      await insertTags(tag_ids, courseId, userId, client);
    }

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
};

// ──────────────────────────────────────────────────────────────────────
// 코스 삭제 
// ──────────────────────────────────────────────────────────────────────
exports.deleteCourse = async (userId, courseId) => {
  const client = await pool.connect();
  try {
    const { rows: [course] } = await client.query(
      `SELECT owner_id FROM courses WHERE course_id=$1 AND status != 'deleted'`,
      [courseId]
    );
    if (!course) {
      const err = new Error('코스를 찾을 수 없습니다.'); err.status = 404; throw err;
    }
    if (course.owner_id !== userId) {
      const err = new Error('삭제 권한이 없습니다.'); err.status = 403; throw err;
    }
    await client.query(
      `UPDATE courses SET status='deleted', updated_at=NOW() WHERE course_id=$1`,
      [courseId]
    );
    return { message: '삭제되었습니다.' };
  } finally { client.release(); }
};
