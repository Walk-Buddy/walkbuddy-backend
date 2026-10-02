require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
// 기본 axios에 공공데이터포털 보조 인증키 전환 적용
require('../services/dataGoKrKey');
const pool = require('../config/db');
const { inferSpotCategoriesWithFallback } = require('../constants/spotCategoryRules');
const { normalizeDurunubiSpotName } = require('../constants/durunubiSpotMappings');

const KAKAO_LOCAL_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const OUTPUT_PATH = path.join(__dirname, '../constants/durunubiSpotMappings.generated.json');
// 매칭 허용 반경: 코스 상세의 주변 스팟 반경(COURSE_NEARBY_SPOT_RADIUS=500)과 맞춘다.
const ROUTE_RADIUS = Number(process.env.DURUNUBI_MAPPING_ROUTE_RADIUS || 500);
const TOUR_ROUTE_RADIUS = Number(process.env.DURUNUBI_MAPPING_TOUR_ROUTE_RADIUS || 1200);
// 이 거리 이내만 코스 경유지(waypoint), 그 밖은 주변 볼거리(nearby)로 분류
const WAYPOINT_RADIUS = Number(process.env.DURUNUBI_WAYPOINT_RADIUS || 300);
const PAGE_SIZE = Number(process.env.DURUNUBI_MAPPING_PAGE_SIZE || 10);

// 경유지가 적은 코스 보강 (TourAPI 위치기반 검색)
const SUPPLEMENT_MIN_SPOTS = Number(process.env.DURUNUBI_SUPPLEMENT_MIN_SPOTS || 2);
const SUPPLEMENT_MAX_SPOTS = Number(process.env.DURUNUBI_SUPPLEMENT_MAX_SPOTS || 6);
// 해안·농촌 구간은 TourAPI 관광지가 드물어 경유지 기준(WAYPOINT_RADIUS)과 같게 둔다.
const SUPPLEMENT_ROUTE_RADIUS = Number(process.env.DURUNUBI_SUPPLEMENT_ROUTE_RADIUS || WAYPOINT_RADIUS);
const SUPPLEMENT_MIN_SPACING_M = Number(process.env.DURUNUBI_SUPPLEMENT_MIN_SPACING || 1000);
const SUPPLEMENT_SAMPLE_STEP_M = 3000;
const SUPPLEMENT_SEARCH_RADIUS_M = 2000;
const SUPPLEMENT_MAX_SAMPLES = 8;
// 관광지(12), 문화시설(14)만 경유지 후보로 사용
const SUPPLEMENT_CONTENT_TYPES = new Set(['12', '14']);

// 장소 자체가 아닌 부속시설·상업시설로 잘못 매칭되는 카카오 카테고리
// (예: 야망대 -> 야망대장어타운)
const EXCLUDED_KAKAO_CATEGORY_PATTERN = /편의점|주차장|화장실|충전소|숙박|매표소|퀵서비스|노인|마을회관|식품판매|입출구|^부동산|^음식점/;
// "원래 이름 + 접미사" 형태의 부속시설 이름 (예: 돌머리해변 주차장, 하조대해변점)
const FACILITY_SUFFIX_PATTERN = /(주차장|공중화장실|화장실|입구|출입구|매점|매표소|관리사무소|휴게소|캠핑장|야영장|글램핑장?|펜션|민박|게스트하우스|하늘동|점)$/;
// 이름 끝 토큰만 남겼을 때 장소명이 아닌 일반 명사
const GENERIC_PLACE_WORDS = new Set([
  '곳', '일원', '일대', '해변', '바다', '마을', '공원', '정자', '경관', '풍경', '시가지', '호수', '포구', '섬', '산', '길', '숲',
]);

const kakaoKey = process.env.KAKAO_REST_API_KEY;
const tourKey = process.env.TOUR_API_SERVICE_KEY || process.env.TOURAPI_SERVICE_KEY;

function requireEnv() {
  if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY가 .env에 없습니다.');
  if (!tourKey) throw new Error('TOUR_API_SERVICE_KEY 또는 TOURAPI_SERVICE_KEY가 .env에 없습니다.');
}

function splitDescriptionSections(description) {
  const sections = {};
  let currentKey = null;

  for (const line of String(description || '').split('\n')) {
    const heading = line.match(/^@@([a-z_]+)\s*$/);
    if (heading) {
      currentKey = heading[1];
      sections[currentKey] = '';
      continue;
    }
    if (currentKey) sections[currentKey] += `${line}\n`;
  }

  for (const key of Object.keys(sections)) sections[key] = sections[key].trim();
  return sections;
}

function cleanSpotNameCandidate(value) {
  return String(value || '')
    .replace(/^[\s"'‘’“”]+|[\s"'‘’“”]+$/g, '')
    .replace(/^(?:봄이면|여름철|창원 유일의|마산의|웅산 서쪽의)\s*/g, '')
    .replace(/^.*의\s+([^\s]+(?:\s+[^\s]+){0,2})$/g, '$1')
    .replace(/^(?:일출|일몰|야경|노을)?\s*명소\s+/g, '')
    .replace(/[.,。·ㆍ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlaceName(name = '') {
  return normalizeDurunubiSpotName(name);
}

function isLikelySpotNameCandidate(value) {
  const normalized = normalizePlaceName(value);
  if (normalized.length < 3) return false;
  return !['봄', '여름', '가을', '겨울', '봄이면', '여름철'].includes(value);
}

// 관형형 어미로 끝나는 토큰 (예: 유명한, 찜질방인, 번성했던, 만나는, 조성된)
// 진·운·간처럼 지명 끝에도 흔한 글자(정동진, 주문진)는 넣지 않는다.
const MODIFIER_TOKEN_PATTERN = /(?:한|된|던|는|인|은|든|친|있는|없는|같은|[어여아]진|알려진)$/;
// 장소명이 될 수 없는 끝 토큰 (조각 전체를 버림)
const NON_NAME_ENDING_PATTERN = /(?:한|된|던|는|있음|함|음)$/;
// 문장 끝의 서술부 (예: 관람 가능, 일원은 바다와 섬진강이 ...)
const TRAILING_PREDICATE_PATTERNS = [
  /\s+일원.*$/,
  /\s+일대.*$/,
  /\s*(?:관람|체험|감상|방문|산책|탐방|구경)?\s*(?:가능|추천)$/,
];

function stripTrailingPredicate(value) {
  let text = String(value || '').trim();
  for (const pattern of TRAILING_PREDICATE_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }
  return text;
}

// 설명 문장에서 마지막 관형어 뒤의 명사구만 남긴다.
// "몽돌해변으로 유명한 호산해변" -> "호산해변"
// "바다가 보이는 찜질방인 남일대 해수월드" -> "남일대 해수월드"
function stripLeadingModifiers(value) {
  const tokens = String(value || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');

  let lastModifierIndex = -1;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (MODIFIER_TOKEN_PATTERN.test(tokens[i])) lastModifierIndex = i;
  }
  return tokens.slice(lastModifierIndex + 1).join(' ');
}

function isGenericPlaceWord(value) {
  return GENERIC_PLACE_WORDS.has(String(value || '').trim());
}

// 설명 문장 하나에서 장소명 후보를 정제한다. 쉼표·슬래시로 묶인 이름은 나눈다.
// 수식어로 끝나는 조각("…재현한")이나 일반 명사("곳")는 버린다.
function refineSpotNameCandidates(value) {
  // "한강과 임진강, 서해가 만나는 곳"처럼 문장 전체가 일반 명사로 끝나면 특정 장소가 아니다.
  const lastWord = stripTrailingPredicate(value).split(/\s+/).pop();
  if (isGenericPlaceWord(lastWord) && String(value).trim().split(/\s+/).length > 1) return [];

  const parts = String(value || '')
    .split(/\s*[,/]\s*|\s+및\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const refined = [];
  for (const part of parts) {
    const withoutPredicate = stripTrailingPredicate(part);
    if (!withoutPredicate) continue;
    if (NON_NAME_ENDING_PATTERN.test(withoutPredicate.split(/\s+/).pop())) continue;

    const name = cleanSpotNameCandidate(stripLeadingModifiers(withoutPredicate));
    if (!name || isGenericPlaceWord(name) || !isLikelySpotNameCandidate(name)) continue;
    refined.push(name);
  }
  return refined;
}

// 카카오 검색에 쓸 이름 변형: 정제된 이름 -> 마지막 두 토큰 -> 마지막 토큰
// ("정자 반구정" -> "반구정", "장산봉 동쪽 자라락" -> "동쪽 자라락" -> "자라락")
function buildNameVariants(name) {
  const tokens = String(name || '').split(/\s+/).filter(Boolean);
  const variants = [tokens.join(' ')];
  if (tokens.length >= 3) variants.push(tokens.slice(-2).join(' '));
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    if (!isGenericPlaceWord(last) && normalizePlaceName(last).length >= 3) variants.push(last);
  }
  return [...new Set(variants.filter(Boolean))];
}

function extractSpotNamesFromTourInfo(tourInfo) {
  const text = String(tourInfo || '').trim();
  if (!text) return [];

  const names = [];
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    const quotedMatches = [...line.matchAll(/['"‘’“”]([^'"‘’“”]+)['"‘’“”]/g)]
      .flatMap((match) => refineSpotNameCandidates(cleanSpotNameCandidate(match[1])));
    if (quotedMatches.length > 0) {
      names.push(...quotedMatches);
      continue;
    }

    const locationParticleMatch = line.match(/(.+?)(?:에서|에는|에\s)/);
    if (locationParticleMatch) {
      const particleCandidates = refineSpotNameCandidates(cleanSpotNameCandidate(locationParticleMatch[1]));
      if (particleCandidates.length > 0) {
        names.push(...particleCandidates);
        continue;
      }
    }

    const markers = [
      '감상할 수 있는 ',
      '느낄 수 있는 ',
      '자랑하는 ',
      '어우러진 ',
      '구경할 수 있는 ',
      '볼 수 있는 ',
      '이어진 ',
      '아기자기한 ',
      '조성된 ',
      '가능한 ',
      '있는 ',
    ];
    let candidate = null;
    for (const marker of markers) {
      const index = line.lastIndexOf(marker);
      if (index >= 0) {
        candidate = line.slice(index + marker.length);
        break;
      }
    }
    if (!candidate) candidate = line;

    names.push(...refineSpotNameCandidates(cleanSpotNameCandidate(candidate)));
  }

  return [...new Set(names)];
}

function isSamePlace(expectedName, actualName) {
  const expected = normalizePlaceName(expectedName);
  const actual = normalizePlaceName(actualName);
  if (!expected || !actual) return false;
  return expected === actual
    || actual.includes(expected)
    || expected.includes(actual);
}

function getNameScore(expectedName, actualName) {
  const expected = normalizePlaceName(expectedName);
  const actual = normalizePlaceName(actualName);
  if (!expected || !actual) return 0;
  if (expected === actual) return 100;
  if (actual.includes(expected)) {
    // "돌머리해변 주차장", "CU 하조대해변점"처럼 원래 장소의 부속시설·지점은 같은 장소가 아니다.
    if (actual.endsWith(expected) === false && FACILITY_SUFFIX_PATTERN.test(actual)) return 0;
    // 덧붙은 글자가 많을수록 다른 장소일 가능성이 커진다.
    return Math.max(50, 85 - (actual.length - expected.length) * 3);
  }
  if (expected.includes(actual)) return actual.length >= 3 ? 70 : 0;
  return 0;
}

function isExcludedKakaoDocument(document) {
  return EXCLUDED_KAKAO_CATEGORY_PATTERN.test(String(document.category_name || ''));
}

function buildKakaoKeywords(sourceName, region) {
  const name = cleanSpotNameCandidate(sourceName);
  return buildNameVariants(name).flatMap((variant) => [
    region ? `${region} ${variant}` : null,
    variant,
  ])
    .filter(Boolean);
}

function buildTourKeywords(sourceName) {
  return [cleanSpotNameCandidate(sourceName)].filter(Boolean);
}

const kakaoCache = new Map();
const tourCache = new Map();
const routeDistanceCache = new Map();
const routePositionCache = new Map();

// near: { x, y, radius }가 있으면 해당 좌표 주변에서만 검색
async function searchKakao(keyword, near = null) {
  const cacheKey = near ? `${keyword}@${near.x},${near.y},${near.radius}` : keyword;
  if (!kakaoCache.has(cacheKey)) {
    const params = { query: keyword, size: PAGE_SIZE, page: 1 };
    if (near) Object.assign(params, { x: near.x, y: near.y, radius: near.radius, sort: 'distance' });
    kakaoCache.set(cacheKey, axios.get(KAKAO_LOCAL_SEARCH_URL, {
      params,
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
    }).then(({ data }) => data.documents || []).catch(() => []));
  }
  return kakaoCache.get(cacheKey);
}

async function searchTourByLocation(x, y, radius) {
  const { data } = await axios.get(`${TOUR_API_BASE_URL}/locationBasedList2`, {
    params: {
      serviceKey: tourKey,
      MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
      MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
      _type: 'json',
      mapX: x,
      mapY: y,
      radius,
      arrange: 'E',
      numOfRows: 50,
      pageNo: 1,
    },
  }).catch(() => ({ data: null }));
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function getRouteSamplePoints(courseId) {
  const { rows } = await pool.query(
    `WITH c AS (
       SELECT route_geometry::geometry AS geom, ST_Length(route_geometry) AS len
       FROM courses
       WHERE course_id = $1
     ),
     n AS (
       SELECT geom, LEAST($3::int, GREATEST(1, CEIL(len / $2)::int)) AS steps FROM c
     )
     SELECT ST_X(p) AS x, ST_Y(p) AS y
     FROM n, generate_series(0, n.steps) AS i,
          LATERAL ST_LineInterpolatePoint(n.geom, i::float / n.steps) AS p`,
    [courseId, SUPPLEMENT_SAMPLE_STEP_M, SUPPLEMENT_MAX_SAMPLES]
  );
  return rows.map((row) => ({ x: Number(row.x), y: Number(row.y) }));
}

async function searchTour(keyword) {
  if (!tourCache.has(keyword)) {
    tourCache.set(keyword, axios.get(`${TOUR_API_BASE_URL}/searchKeyword2`, {
      params: {
        serviceKey: tourKey,
        MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
        MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
        _type: 'json',
        keyword,
        numOfRows: PAGE_SIZE,
        pageNo: 1,
      },
    }).then(({ data }) => {
      const item = data?.response?.body?.items?.item;
      if (!item) return [];
      return Array.isArray(item) ? item : [item];
    }).catch(() => []));
  }
  return tourCache.get(keyword);
}

async function getRouteDistance(courseId, lng, lat) {
  const key = `${courseId}:${lng}:${lat}`;
  if (!routeDistanceCache.has(key)) {
    routeDistanceCache.set(key, pool.query(
      `SELECT ST_Distance(route_geometry, ST_Point($2, $3)::GEOGRAPHY) AS distance_m
       FROM courses
       WHERE course_id = $1`,
      [courseId, Number(lng), Number(lat)]
    ).then(({ rows }) => Number(rows[0]?.distance_m)).catch(() => null));
  }
  return routeDistanceCache.get(key);
}

async function getRoutePosition(courseId, lng, lat) {
  const key = `${courseId}:${lng}:${lat}`;
  if (!routePositionCache.has(key)) {
    routePositionCache.set(key, pool.query(
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
      [courseId, Number(lng), Number(lat)]
    ).then(({ rows }) => {
      const row = rows[0];
      if (!row || row.progress == null) return null;
      return {
        routeProgress: Number(row.progress),
        distanceFromStartM: Math.round(Number(row.distance_from_start_m || 0)),
      };
    }).catch(() => null));
  }
  return routePositionCache.get(key);
}

async function findKakaoMatch(course, sourceName, region) {
  const seenPlaceIds = new Set();
  const matches = [];

  const nameVariants = buildNameVariants(cleanSpotNameCandidate(sourceName));

  for (const keyword of buildKakaoKeywords(sourceName, region)) {
    const documents = await searchKakao(keyword);
    for (const document of documents) {
      if (!document.id || seenPlaceIds.has(document.id)) continue;
      seenPlaceIds.add(document.id);
      if (isExcludedKakaoDocument(document)) continue;

      const score = Math.max(...nameVariants.map((variant) => getNameScore(variant, document.place_name)));
      if (score <= 0) continue;

      const distance = await getRouteDistance(course.course_id, document.x, document.y);
      if (!Number.isFinite(distance) || distance > ROUTE_RADIUS) continue;

      matches.push({
        kakaoPlaceId: String(document.id),
        canonicalName: document.place_name,
        address: document.road_address_name || document.address_name || null,
        kakaoCategoryName: document.category_name || null,
        categories: inferSpotCategoriesWithFallback(document),
        x: document.x,
        y: document.y,
        routeDistance: Math.round(distance),
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score || a.routeDistance - b.routeDistance)[0] || null;
}

async function findTourMatch(course, sourceName, kakaoMatch) {
  const seenContentIds = new Set();
  const matches = [];
  const aliases = [sourceName];
  if (kakaoMatch?.canonicalName) aliases.push(kakaoMatch.canonicalName);

  for (const keyword of buildTourKeywords(sourceName)) {
    const items = await searchTour(keyword);
    for (const item of items) {
      if (!item.contentid || seenContentIds.has(String(item.contentid))) continue;
      seenContentIds.add(String(item.contentid));

      if (!aliases.some((alias) => isSamePlace(alias, item.title))) continue;
      if (!item.mapx || !item.mapy) continue;

      const distance = await getRouteDistance(course.course_id, item.mapx, item.mapy);
      if (!Number.isFinite(distance) || distance > TOUR_ROUTE_RADIUS) continue;

      matches.push({
        tourApiContentId: String(item.contentid),
        tourApiTitle: item.title,
        tourX: item.mapx,
        tourY: item.mapy,
        tourRouteDistance: Math.round(distance),
      });
    }
  }

  return matches.sort((a, b) => a.tourRouteDistance - b.tourRouteDistance)[0] || null;
}

// tour_info에서 경유지를 충분히 못 찾은 코스는 경로 주변 TourAPI 관광지·문화시설로 보강한다.
// 카카오 장소로 저장해야 하므로 TourAPI 좌표 근처에서 같은 이름의 카카오 장소를 다시 찾는다.
async function findSupplementSpots(course, existingRows) {
  const takenPlaceIds = new Set(existingRows.map((row) => row.mapping.kakaoPlaceId).filter(Boolean));
  const takenDistances = existingRows
    .map((row) => row.mapping.distanceFromStartM)
    .filter(Number.isFinite);
  const slots = SUPPLEMENT_MAX_SPOTS - existingRows.filter(isWaypointRow).length;
  if (slots <= 0) return [];

  const seenContentIds = new Set();
  const tourItems = [];
  for (const point of await getRouteSamplePoints(course.course_id)) {
    for (const item of await searchTourByLocation(point.x, point.y, SUPPLEMENT_SEARCH_RADIUS_M)) {
      const contentId = String(item.contentid || '');
      if (!contentId || seenContentIds.has(contentId)) continue;
      seenContentIds.add(contentId);
      if (!SUPPLEMENT_CONTENT_TYPES.has(String(item.contenttypeid)) || !item.mapx || !item.mapy) continue;

      const routeDistance = await getRouteDistance(course.course_id, item.mapx, item.mapy);
      if (!Number.isFinite(routeDistance) || routeDistance > SUPPLEMENT_ROUTE_RADIUS) continue;
      tourItems.push({ item, routeDistance });
    }
  }

  // 대표 이미지가 있는 곳(정보가 풍부한 관광지)을 우선, 그다음 경로에 가까운 순
  tourItems.sort((a, b) => Number(Boolean(b.item.firstimage)) - Number(Boolean(a.item.firstimage))
    || a.routeDistance - b.routeDistance);

  const picked = [];
  for (const { item } of tourItems) {
    if (picked.length >= slots) break;

    const documents = await searchKakao(cleanSpotNameCandidate(item.title), { x: item.mapx, y: item.mapy, radius: 300 });
    const document = documents.find((doc) => (
      doc.id
      && !takenPlaceIds.has(String(doc.id))
      && !isExcludedKakaoDocument(doc)
      && getNameScore(item.title, doc.place_name) >= 70
    ));
    if (!document) continue;

    const routeDistance = await getRouteDistance(course.course_id, document.x, document.y);
    if (!Number.isFinite(routeDistance) || routeDistance > SUPPLEMENT_ROUTE_RADIUS) continue;

    const routePosition = await getRoutePosition(course.course_id, document.x, document.y);
    if (!routePosition) continue;
    const tooClose = [...takenDistances, ...picked.map((row) => row.mapping.distanceFromStartM)]
      .some((d) => Math.abs(d - routePosition.distanceFromStartM) < SUPPLEMENT_MIN_SPACING_M);
    if (tooClose) continue;

    takenPlaceIds.add(String(document.id));
    picked.push({
      courseName: course.name,
      courseSourceId: course.source_id,
      sourceName: item.title,
      sourceIndex: Number.MAX_SAFE_INTEGER,
      normalizedSourceName: normalizePlaceName(item.title),
      selection: 'route_nearby',
      mapping: cleanMapping({
        canonicalName: document.place_name,
        kakaoPlaceId: String(document.id),
        address: document.road_address_name || document.address_name || null,
        categories: inferSpotCategoriesWithFallback(document),
        kakaoCategoryName: document.category_name || null,
        x: document.x,
        y: document.y,
        tourApiContentId: String(item.contentid),
        routeDistance: Math.round(routeDistance),
        routeProgress: routePosition.routeProgress,
        distanceFromStartM: routePosition.distanceFromStartM,
      }),
    });
  }

  return picked;
}

function isWaypointRow(row) {
  return Boolean(row.mapping.kakaoPlaceId)
    && Number.isFinite(row.mapping.routeDistance)
    && row.mapping.routeDistance <= WAYPOINT_RADIUS;
}

function getRowStatus(row) {
  if (isWaypointRow(row)) return 'mapped';
  if (row.mapping.kakaoPlaceId || row.mapping.tourApiContentId) return 'nearby';
  return 'unmapped';
}

function cleanMapping(addition) {
  return Object.fromEntries(
    Object.entries({
      ...addition,
    }).filter(([, value]) => (
      value !== null
      && value !== undefined
      && !(Array.isArray(value) && value.length === 0)
    ))
  );
}

async function main() {
  requireEnv();

  const { rows: courses } = await pool.query(
    `SELECT course_id, name, source_id, description
     FROM courses
     WHERE data_source = '한국관광공사_두루누비'
       AND status != 'deleted'
     ORDER BY name`
  );

  const rawRows = [];
  const stats = {
    courses: courses.length,
    parsedPlaces: 0,
    mappedPlaces: 0,
    kakaoMapped: 0,
    tourMapped: 0,
    unmappedPlaces: 0,
    waypointPlaces: 0,
    nearbyPlaces: 0,
    supplementedCourses: 0,
    supplementedPlaces: 0,
  };

  for (const [index, course] of courses.entries()) {
    const sections = splitDescriptionSections(course.description);
    const region = sections.region || '';
    const spotNames = extractSpotNamesFromTourInfo(sections.tour_info);
    const courseRowStart = rawRows.length;

    for (const [sourceIndex, sourceName] of spotNames.entries()) {
      stats.parsedPlaces += 1;
      const kakaoMatch = await findKakaoMatch(course, sourceName, region);
      const tourMatch = await findTourMatch(course, sourceName, kakaoMatch);
      const routePosition = kakaoMatch
        ? await getRoutePosition(course.course_id, kakaoMatch.x, kakaoMatch.y)
        : tourMatch?.tourX && tourMatch?.tourY
          ? await getRoutePosition(course.course_id, tourMatch.tourX, tourMatch.tourY)
          : null;

      if (kakaoMatch || tourMatch) stats.mappedPlaces += 1;
      if (kakaoMatch) stats.kakaoMapped += 1;
      if (tourMatch) stats.tourMapped += 1;
      if (!kakaoMatch && !tourMatch) stats.unmappedPlaces += 1;

      rawRows.push({
        courseName: course.name,
        courseSourceId: course.source_id,
        sourceName,
        sourceIndex,
        normalizedSourceName: normalizePlaceName(sourceName),
        selection: 'tour_info',
        mapping: cleanMapping({
          canonicalName: kakaoMatch?.canonicalName || tourMatch?.tourApiTitle || null,
          kakaoPlaceId: kakaoMatch?.kakaoPlaceId || null,
          address: kakaoMatch?.address || null,
          categories: kakaoMatch?.categories || [],
          kakaoCategoryName: kakaoMatch?.kakaoCategoryName || null,
          x: kakaoMatch?.x || null,
          y: kakaoMatch?.y || null,
          tourApiContentId: tourMatch?.tourApiContentId || null,
          routeDistance: kakaoMatch?.routeDistance ?? null,
          tourRouteDistance: tourMatch?.tourRouteDistance ?? null,
          routeProgress: routePosition?.routeProgress ?? null,
          distanceFromStartM: routePosition?.distanceFromStartM ?? null,
        }),
      });
    }

    const courseRows = rawRows.slice(courseRowStart);
    if (courseRows.filter(isWaypointRow).length < SUPPLEMENT_MIN_SPOTS) {
      const supplements = await findSupplementSpots(course, courseRows);
      if (supplements.length > 0) {
        rawRows.push(...supplements);
        stats.supplementedCourses += 1;
        stats.supplementedPlaces += supplements.length;
      }
    }

    if ((index + 1) % 25 === 0 || index + 1 === courses.length) {
      console.log(`[${index + 1}/${courses.length}] parsed=${stats.parsedPlaces}, mapped=${stats.mappedPlaces}, unmapped=${stats.unmappedPlaces}`);
    }
  }

  const byCourse = {};
  const unmapped = [];

  for (const course of courses) {
    const rows = rawRows
      .filter((row) => row.courseName === course.name)
      .sort((a, b) => {
        const aProgress = Number.isFinite(a.mapping.routeProgress) ? a.mapping.routeProgress : Number.POSITIVE_INFINITY;
        const bProgress = Number.isFinite(b.mapping.routeProgress) ? b.mapping.routeProgress : Number.POSITIVE_INFINITY;
        return aProgress - bProgress || a.sourceIndex - b.sourceIndex;
      });

    for (const row of rows) {
      const status = getRowStatus(row);
      if (status === 'mapped') stats.waypointPlaces += 1;
      if (status === 'nearby') stats.nearbyPlaces += 1;
    }

    // status: mapped = 코스 경유지(WAYPOINT_RADIUS 이내), nearby = 주변 볼거리, unmapped = 매칭 실패
    // selection: tour_info = 두루누비 관광정보 문구에서 추출, route_nearby = 경로 주변 TourAPI로 보강
    byCourse[course.name] = rows.map((row, index) => ({
      order: index + 1,
      sourceName: row.sourceName,
      normalizedSourceName: row.normalizedSourceName,
      status: getRowStatus(row),
      selection: row.selection,
      routeProgress: row.mapping.routeProgress ?? null,
      distanceFromStartM: row.mapping.distanceFromStartM ?? null,
      mapping: row.mapping,
    }));
  }

  unmapped.push(...rawRows
    .filter((row) => !row.mapping.kakaoPlaceId && !row.mapping.tourApiContentId)
    .map((row) => ({ courseName: row.courseName, sourceName: row.sourceName })));

  const output = {
    generatedAt: new Date().toISOString(),
    stats,
    byCourse,
    unmapped,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\n생성 완료: ${OUTPUT_PATH}`);
  console.log(JSON.stringify({
    ...stats,
    byCourse: Object.keys(byCourse).length,
    unmapped: unmapped.length,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(`두루누비 스팟 매핑 생성 실패: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
