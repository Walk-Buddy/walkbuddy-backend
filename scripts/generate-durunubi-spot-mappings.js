require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pool = require('../config/db');
const { inferSpotCategoriesWithFallback } = require('../constants/spotCategoryRules');
const { normalizeDurunubiSpotName } = require('../constants/durunubiSpotMappings');

const KAKAO_LOCAL_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const OUTPUT_PATH = path.join(__dirname, '../constants/durunubiSpotMappings.generated.json');
const ROUTE_RADIUS = Number(process.env.DURUNUBI_MAPPING_ROUTE_RADIUS || 900);
const TOUR_ROUTE_RADIUS = Number(process.env.DURUNUBI_MAPPING_TOUR_ROUTE_RADIUS || 1200);
const PAGE_SIZE = Number(process.env.DURUNUBI_MAPPING_PAGE_SIZE || 10);

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
      .map((match) => cleanSpotNameCandidate(match[1]))
      .filter(Boolean);
    if (quotedMatches.length > 0) {
      names.push(...quotedMatches);
      continue;
    }

    const locationParticleMatch = line.match(/(.+?)(?:에서|에는|에\s)/);
    if (locationParticleMatch) {
      const particleCandidate = cleanSpotNameCandidate(locationParticleMatch[1]);
      if (isLikelySpotNameCandidate(particleCandidate)) {
        names.push(particleCandidate);
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

    const cleaned = cleanSpotNameCandidate(candidate);
    if (cleaned) names.push(cleaned);
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
  if (actual.includes(expected)) return 85;
  if (expected.includes(actual)) return 70;
  return 0;
}

function buildKakaoKeywords(sourceName, region) {
  const name = cleanSpotNameCandidate(sourceName);
  return [
    region ? `${region} ${name}` : null,
    name,
  ]
    .filter(Boolean);
}

function buildTourKeywords(sourceName) {
  return [cleanSpotNameCandidate(sourceName)].filter(Boolean);
}

const kakaoCache = new Map();
const tourCache = new Map();
const routeDistanceCache = new Map();
const routePositionCache = new Map();

async function searchKakao(keyword) {
  if (!kakaoCache.has(keyword)) {
    kakaoCache.set(keyword, axios.get(KAKAO_LOCAL_SEARCH_URL, {
      params: { query: keyword, size: PAGE_SIZE, page: 1 },
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
    }).then(({ data }) => data.documents || []).catch(() => []));
  }
  return kakaoCache.get(keyword);
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

  for (const keyword of buildKakaoKeywords(sourceName, region)) {
    const documents = await searchKakao(keyword);
    for (const document of documents) {
      if (!document.id || seenPlaceIds.has(document.id)) continue;
      seenPlaceIds.add(document.id);

      const score = getNameScore(sourceName, document.place_name);
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
  };

  for (const [index, course] of courses.entries()) {
    const sections = splitDescriptionSections(course.description);
    const region = sections.region || '';
    const spotNames = extractSpotNamesFromTourInfo(sections.tour_info);

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

    byCourse[course.name] = rows.map((row, index) => ({
      order: index + 1,
      sourceName: row.sourceName,
      normalizedSourceName: row.normalizedSourceName,
      status: row.mapping.kakaoPlaceId || row.mapping.tourApiContentId ? 'mapped' : 'unmapped',
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
