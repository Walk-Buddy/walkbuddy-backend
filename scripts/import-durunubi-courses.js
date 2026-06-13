require('dotenv').config();

const axios = require('axios');
const pool = require('../config/db');
const spotService = require('../services/spotService');
const { getDurunubiCourseSpotMappings } = require('../constants/durunubiSpotMappings');

const BASE_URL = 'http://apis.data.go.kr/B551011/Durunubi';
const DATA_SOURCE = '한국관광공사_두루누비';
const COURSE_TAG_NAME = '둘레길';
const DEFAULT_MOBILE_OS = 'ETC';
const DEFAULT_MOBILE_APP = 'WalkBuddy';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_WAYPOINTS = 1200;

const serviceKey = process.env.DURUNUBI_SERVICE_KEY;
const mobileOS = process.env.DURUNUBI_MOBILE_OS || DEFAULT_MOBILE_OS;
const mobileApp = process.env.DURUNUBI_MOBILE_APP || DEFAULT_MOBILE_APP;
const brdDiv = process.env.DURUNUBI_BRD_DIV || '';
const maxImport = toInt(process.env.DURUNUBI_MAX_IMPORT, 0);
const startIndex = Math.max(0, toInt(process.env.DURUNUBI_START_INDEX, 0));
const maxWaypoints = toInt(process.env.DURUNUBI_MAX_WAYPOINTS, DEFAULT_MAX_WAYPOINTS);

const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'WalkBuddy-Durunubi-Importer/1.0',
  },
});

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function requireEnv() {
  if (!serviceKey) {
    throw new Error('DURUNUBI_SERVICE_KEY가 .env에 없습니다.');
  }
}

function buildUrl(pathname, params) {
  const url = new URL(`${BASE_URL}/${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });

  // 공공데이터포털에서 "Encoding" 키를 복사한 경우를 위해 이미 인코딩된 키는 그대로 붙입니다.
  if (serviceKey.includes('%')) {
    return `${url.toString()}&serviceKey=${serviceKey}`;
  }

  url.searchParams.append('serviceKey', serviceKey);
  return url.toString();
}

async function requestDurunubi(pathname, params) {
  const url = buildUrl(pathname, {
    MobileOS: mobileOS,
    MobileApp: mobileApp,
    _type: 'json',
    ...params,
  });

  try {
    const { data } = await http.get(url);
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error(
        '두루누비 API 인증에 실패했습니다. 공공데이터포털에서 일반 인증키(Decoding)를 넣었는지, 활용신청 승인이 완료됐는지 확인해주세요.'
      );
    }
    throw err;
  }
}

function getItems(data) {
  const body = data?.response?.body;
  const item = body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function getTotalCount(data) {
  return toInt(data?.response?.body?.totalCount, 0);
}

async function fetchCoursePage(pageNo) {
  const data = await requestDurunubi('courseList', {
    pageNo,
    numOfRows: DEFAULT_PAGE_SIZE,
    brdDiv,
  });

  const resultCode = data?.response?.header?.resultCode;
  if (resultCode && resultCode !== '0000') {
    const message = data?.response?.header?.resultMsg || '두루누비 API 호출 실패';
    throw new Error(`${message} (${resultCode})`);
  }

  return {
    totalCount: getTotalCount(data),
    items: getItems(data),
  };
}

async function fetchAllCourses() {
  const firstPage = await fetchCoursePage(1);
  const totalCount = firstPage.totalCount || firstPage.items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));
  const courses = [...firstPage.items];

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    const page = await fetchCoursePage(pageNo);
    courses.push(...page.items);
  }

  const selectedCourses = startIndex > 0 ? courses.slice(startIndex) : courses;
  return maxImport > 0 ? selectedCourses.slice(0, maxImport) : selectedCourses;
}

function pick(item, keys) {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      return item[key];
    }
  }
  return null;
}

function buildDescription(item) {
  //파싱하기 쉬운 내부 섹션 키로 저장
  //crsSummary -> @@summary, crsContents -> @@content
  const sections = [
    // 배열의 첫 번째 값은 우리가 정한 내부 key입니다.
    // 배열의 두 번째 값은 두루누비 API 원본 필드에서 꺼낸 값입니다.
    ['summary', pick(item, ['crsSummary'])],
    ['content', pick(item, ['crsContents'])],
    ['tour_info', pick(item, ['crsTourInfo'])],
    ['traveler_info', pick(item, ['travelerinfo', 'travelerInfo'])],
    ['region', pick(item, ['sigun'])],
    ['cycle', pick(item, ['crsCycle'])],
  ];

  return sections
    .map(([key, value]) => {
      const text = cleanText(value);

      if (!text) { return null; }

      return `@@${key}\n${text}`;
    })

    .filter(Boolean)
    .join('\n\n') || null;
}

function cleanText(value) {
  if (!value) return null;

  return decodeHtmlEntities(String(value))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function parseGpxPoints(gpx) {
  const points = [];
  const pointRegex = /<(?:trkpt|rtept|wpt)\b[^>]*\blat=["']([-0-9.]+)["'][^>]*\blon=["']([-0-9.]+)["'][^>]*>/gi;
  let match;

  while ((match = pointRegex.exec(gpx)) !== null) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      points.push({ lat, lng });
    }
  }

  return points;
}

function samplePoints(points) {
  if (points.length <= maxWaypoints) return points;

  const sampled = [];
  const lastIndex = points.length - 1;

  for (let i = 0; i < maxWaypoints; i += 1) {
    const sourceIndex = Math.round((i * lastIndex) / (maxWaypoints - 1));
    sampled.push(points[sourceIndex]);
  }

  return sampled;
}

function toWkt(points) {
  return `SRID=4326;LINESTRING(${points.map((p) => `${p.lng} ${p.lat}`).join(', ')})`;
}

async function fetchGpxPoints(gpxPath) {
  if (!gpxPath) return [];
  const { data } = await http.get(gpxPath, { responseType: 'text' });
  return samplePoints(parseGpxPoints(String(data)));
}

async function ensureAdminUser(client) {
  if (process.env.DURUNUBI_OWNER_USER_ID) {
    const { rows } = await client.query(
      `SELECT user_id
       FROM users
       WHERE user_id = $1 AND role = 'admin' AND status = 'active'`,
      [process.env.DURUNUBI_OWNER_USER_ID]
    );

    if (!rows.length) {
      throw new Error('DURUNUBI_OWNER_USER_ID에 해당하는 active admin 사용자를 찾을 수 없습니다.');
    }

    return rows[0].user_id;
  }

  const { rows: admins } = await client.query(
    `SELECT user_id
     FROM users
     WHERE role = 'admin' AND status = 'active'
     ORDER BY created_at
     LIMIT 1`
  );

  if (admins.length) return admins[0].user_id;

  const { rows: seedAdmins } = await client.query(
    `SELECT user_id
     FROM users
     WHERE social_provider = 'seed' AND social_id = 'durunubi-admin'
     LIMIT 1`
  );

  if (seedAdmins.length) {
    await client.query(
      `UPDATE users
       SET role = 'admin', status = 'active'
       WHERE user_id = $1`,
      [seedAdmins[0].user_id]
    );
    return seedAdmins[0].user_id;
  }

  const nickname = await findAvailableNickname(client, '두루누비관리');
  const { rows } = await client.query(
    `INSERT INTO users (nickname, social_provider, social_id, role)
     VALUES ($1, 'seed', 'durunubi-admin', 'admin')
     RETURNING user_id`,
    [nickname]
  );

  return rows[0].user_id;
}

async function findAvailableNickname(client, baseName) {
  for (let i = 0; i < 100; i += 1) {
    const nickname = i === 0 ? baseName : `${baseName}${i}`;
    const { rows } = await client.query(
      `SELECT 1 FROM users WHERE nickname = $1 LIMIT 1`,
      [nickname]
    );

    if (!rows.length) return nickname;
  }

  throw new Error('두루누비 관리자 계정에 사용할 수 있는 닉네임을 만들지 못했습니다.');
}

async function ensureCourseTag(client) {
  const { rows } = await client.query(
    `INSERT INTO tags (name, type, is_active)
     VALUES ($1, 'course', TRUE)
     ON CONFLICT (name, type)
     DO UPDATE SET is_active = TRUE
     RETURNING tag_id`,
    [COURSE_TAG_NAME]
  );

  return rows[0].tag_id;
}

async function insertWaypoints(client, courseId, points, spotWaypoints = []) {
  const lastPointIndex = Math.max(1, points.length - 1);
  const pinRows = points.map((point, index) => ({
    type: 'pin',
    progress: index / lastPointIndex,
    spotId: null,
    lat: point.lat,
    lng: point.lng,
  }));
  const spotRows = spotWaypoints
    .filter((spot) => spot.spotId && Number.isFinite(spot.routeProgress))
    .map((spot) => ({
      type: 'spot',
      progress: spot.routeProgress,
      spotId: spot.spotId,
      lat: null,
      lng: null,
    }));
  const rows = [...pinRows, ...spotRows].sort((a, b) => (
    a.progress - b.progress
    || (a.type === 'spot' ? -1 : 1)
  ));
  const seqs = rows.map((_, index) => index + 1);
  const types = rows.map((row) => row.type);
  const spotIds = rows.map((row) => row.spotId);
  const lats = rows.map((row) => row.lat);
  const lngs = rows.map((row) => row.lng);

  await client.query(`DELETE FROM course_waypoints WHERE course_id = $1`, [courseId]);
  await client.query(
    `INSERT INTO course_waypoints (course_id, seq, type, spot_id, lat, lng)
     SELECT $1, seq, type, spot_id, lat, lng
     FROM unnest(
       $2::smallint[],
       $3::varchar[],
       $4::uuid[],
       $5::numeric[],
       $6::numeric[]
     ) AS t(seq, type, spot_id, lat, lng)`,
    [courseId, seqs, types, spotIds, lats, lngs]
  );
}

async function getRoutePositionFromCourseRoute(client, courseId, spot) {
  const lng = Number(spot.x);
  const lat = Number(spot.y);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const { rows: [result] } = await client.query(
    `WITH located AS (
       SELECT
         route_geometry::geometry AS geom,
         ST_LineLocatePoint(
           route_geometry::geometry,
           ST_SetSRID(ST_Point($2, $3), 4326)
         ) AS progress
       FROM courses
       WHERE course_id = $1
     )
     SELECT
       progress,
       ST_Length(ST_LineSubstring(geom, 0, progress)::geography) AS distance_from_start_m
     FROM located`,
    [courseId, lng, lat]
  );

  if (!result || result.progress == null) return null;
  return {
    routeProgress: Number(result.progress),
    distanceFromStartM: Math.round(Number(result.distance_from_start_m || 0)),
  };
}

function buildDurunubiSpotCandidate(spotName, mapping) {
  if (
    !mapping?.kakaoPlaceId
    || mapping.x == null
    || mapping.y == null
    || !Array.isArray(mapping.categories)
    || mapping.categories.length === 0
  ) {
    return null;
  }

  return {
    kakao_place_id: String(mapping.kakaoPlaceId),
    name: mapping.canonicalName || spotName,
    kakao_category_name: mapping.kakaoCategoryName || null,
    categories: mapping.categories,
    address: mapping.address || null,
    x: mapping.x,
    y: mapping.y,
    source_spot_name: spotName,
    canonical_name: mapping.canonicalName || null,
    tour_api_content_id: mapping.tourApiContentId || null,
    route_progress: mapping.routeProgress ?? null,
    distance_from_start_m: mapping.distanceFromStartM ?? null,
    route_distance: mapping.routeDistance ?? null,
  };
}

async function importDurunubiSpotsForCourse(client, item, courseId, ownerId) {
  const courseName = pick(item, ['crsKorNm']) || '';
  const spotEntries = getDurunubiCourseSpotMappings(courseName);
  const result = {
    candidates: spotEntries.length,
    saved: 0,
    skipped: 0,
    failed: 0,
    details: [],
    waypointSpots: [],
  };

  for (const entry of spotEntries) {
    const spotName = entry.sourceName;
    const mapping = entry.mapping && Object.keys(entry.mapping).length > 0
      ? {
        ...entry.mapping,
        routeProgress: entry.mapping.routeProgress ?? entry.routeProgress ?? null,
        distanceFromStartM: entry.mapping.distanceFromStartM ?? entry.distanceFromStartM ?? null,
      }
      : null;

    try {
      const candidate = buildDurunubiSpotCandidate(spotName, mapping);
      if (!candidate) {
        result.skipped += 1;
        result.details.push({ spotName, order: entry.order, status: 'skipped_unmapped' });
        continue;
      }

      const saved = await spotService.saveKakaoSpot(candidate, ownerId);
      const routePosition = Number.isFinite(Number(candidate.route_progress))
        ? {
          routeProgress: Number(candidate.route_progress),
          distanceFromStartM: candidate.distance_from_start_m == null
            ? null
            : Number(candidate.distance_from_start_m),
        }
        : await getRoutePositionFromCourseRoute(client, courseId, candidate);
      if (saved.spot?.spot_id && routePosition && Number.isFinite(routePosition.routeProgress)) {
        result.waypointSpots.push({
          spotId: saved.spot.spot_id,
          routeProgress: routePosition.routeProgress,
          distanceFromStartM: routePosition.distanceFromStartM,
          sourceName: spotName,
          savedName: saved.spot.name,
        });
      }
      result.saved += saved.is_created ? 1 : 0;
      result.details.push({
        spotName,
        order: entry.order,
        status: saved.is_created ? 'created' : 'existing',
        savedName: saved.spot.name,
        routeDistance: candidate.route_distance == null ? null : Math.round(candidate.route_distance),
        routeProgress: routePosition?.routeProgress ?? null,
        tourContentStatus: saved.tour_content_status,
      });
    } catch (err) {
      result.failed += 1;
      result.details.push({ spotName, order: entry.order, status: 'failed', reason: err.message });
    }
  }

  result.waypointSpots.sort((a, b) => a.routeProgress - b.routeProgress);
  return result;
}

async function importCourse(client, item, ownerId, tagId) {
  const routeIdx = pick(item, ['routeIdx']);
  const crsIdx = pick(item, ['crsIdx']);
  const sourceId = crsIdx || routeIdx;
  const name = pick(item, ['crsKorNm']);
  const gpxPath = pick(item, ['gpxpath', 'gpxPath']);

  if (!sourceId || !name || !gpxPath) {
    return { status: 'skipped', reason: '필수값 없음', name: name || sourceId || 'unknown' };
  }

  const points = await fetchGpxPoints(gpxPath);
  if (points.length < 2) {
    return { status: 'skipped', reason: 'GPX 좌표 부족', name };
  }

  const wkt = toWkt(points);
  const distanceFromApi = toNumber(pick(item, ['crsDstnc']));
  const durationFromApi = toNumber(pick(item, ['crsTotlRqrmHour']));

  const { rows: [stats] } = await client.query(
    `SELECT GREATEST(1, ROUND(ST_Length($1::geography))::int) AS distance`,
    [wkt]
  );

  const totalDistance = distanceFromApi ? Math.max(1, Math.round(distanceFromApi * 1000)) : stats.distance;
  const estimatedDuration = durationFromApi || Math.max(1, Math.ceil(stats.distance / 1.1 / 60));
  const description = buildDescription(item);

  const { rows: [course] } = await client.query(
    `INSERT INTO courses (
       owner_id, name, description, category, route_geometry,
       total_distance, estimated_duration, is_public,
       data_source, source_id, status
     )
     VALUES (
       $1, $2, $3, '둘레길', $4::geography,
       $5, $6, TRUE,
       $7, $8, 'active'
     )
     ON CONFLICT (data_source, source_id) WHERE source_id IS NOT NULL
     DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       route_geometry = EXCLUDED.route_geometry,
       total_distance = EXCLUDED.total_distance,
       estimated_duration = EXCLUDED.estimated_duration,
       is_public = TRUE,
       data_source = EXCLUDED.data_source,
       status = 'active',
       updated_at = NOW()
     RETURNING course_id`,
    [ownerId, name, description, wkt, totalDistance, estimatedDuration, DATA_SOURCE, sourceId]
  );

  await insertWaypoints(client, course.course_id, points);
  await client.query(
    `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
     VALUES ($1, $2, 'course', $3)
     ON CONFLICT DO NOTHING`,
    [tagId, course.course_id, ownerId]
  );

  return { status: 'imported', name, courseId: course.course_id, pointCount: points.length, points };
}

async function main() {
  requireEnv();

  const courses = await fetchAllCourses();
  const client = await pool.connect();
  const summary = {
    total: courses.length,
    imported: 0,
    spot_candidates: 0,
    spots_saved: 0,
    spots_skipped: 0,
    spots_failed: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    const ownerId = await ensureAdminUser(client);
    const tagId = await ensureCourseTag(client);

    for (const [index, item] of courses.entries()) {
      const label = pick(item, ['crsKorNm']) || pick(item, ['crsIdx']) || `row-${index + 1}`;

      try {
        await client.query('BEGIN');
        const result = await importCourse(client, item, ownerId, tagId);
        await client.query('COMMIT');

        if (result.status === 'imported') {
          summary.imported += 1;
          console.log(`[${index + 1}/${courses.length}] 저장: ${result.name} (${result.pointCount} points)`);

          const spotResult = await importDurunubiSpotsForCourse(client, item, result.courseId, ownerId);
          summary.spot_candidates += spotResult.candidates;
          summary.spots_saved += spotResult.saved;
          summary.spots_skipped += spotResult.skipped;
          summary.spots_failed += spotResult.failed;

          if (spotResult.candidates > 0) {
            const savedLabels = spotResult.details
              .filter((detail) => detail.status === 'created' || detail.status === 'existing')
              .map((detail) => {
                const distanceLabel = detail.routeDistance == null ? 'mapped' : `${detail.routeDistance}m`;
                return `${detail.savedName}(${detail.status}, ${distanceLabel})`;
              });
            console.log(`  - tour_info 스팟: 후보 ${spotResult.candidates}개, 신규 ${spotResult.saved}개, 제외 ${spotResult.skipped}개, 실패 ${spotResult.failed}개`);
            if (savedLabels.length > 0) {
              console.log(`  - 저장/확인: ${savedLabels.join(', ')}`);
            }
            const skippedLabels = spotResult.details
              .filter((detail) => detail.status === 'skipped_unmapped')
              .map((detail) => detail.spotName);
            if (skippedLabels.length > 0) {
              console.log(`  - 제외: ${skippedLabels.join(', ')}`);
            }
          }

          await client.query('BEGIN');
          await insertWaypoints(client, result.courseId, result.points, spotResult.waypointSpots);
          await client.query('COMMIT');
          if (spotResult.waypointSpots.length > 0) {
            console.log(`  - 코스 경유지 연결: 스팟 ${spotResult.waypointSpots.length}개`);
          }
        } else {
          summary.skipped += 1;
          console.log(`[${index + 1}/${courses.length}] 건너뜀: ${result.name} - ${result.reason}`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        summary.failed += 1;
        console.error(`[${index + 1}/${courses.length}] 실패: ${label} - ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n두루누비 코스 import 결과');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(`두루누비 코스 import 중단: ${err.message}`);
  try {
    await pool.end();
  } catch {
    // 이미 종료된 pool이면 추가로 처리할 일이 없습니다.
  }
  process.exit(1);
});
