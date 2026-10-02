require('dotenv').config();

// 두루누비 코스 경유지 큐레이션 도구
//
// 규칙 기반 자동 매핑(generate-durunubi-spot-mappings.js) 대신, 사람이 코스 설명을 읽고
// 고른 장소를 constants/durunubiSpotMappings.curated.json 에 확정해 두기 위한 스크립트.
// DB에 코스가 없어도 동작하도록 경로 거리는 두루누비 GPX로 직접 계산한다.
//
// 1) 후보 수집: 코스별 검색어로 카카오 장소를 찾아 경로 근처 후보를 모은다.
//    node scripts/curate-durunubi-spots.js candidates <queries.json> <candidates.json>
//    queries.json: { "<crsIdx>": ["송도해수욕장", "암남공원", ...] }
//
// 2) 확정: 후보 중 고른 장소를 큐레이션 파일에 반영한다. (코스 단위로 덮어씀)
//    node scripts/curate-durunubi-spots.js build <candidates.json> <picks.json>
//    picks.json: { "<crsIdx>": [{ "kakaoPlaceId": "123", "sourceName": "송도해수욕장", "note": "..." }] }
//    status 를 "nearby"로 주면 경유지가 아닌 주변 볼거리로만 저장된다.
//    endpoint 를 "start"/"end"로 주면 이름 없는 출발/도착 핀 대신 그 스팟을 쓴다.
//    후보 수집을 여러 번 했다면 candidates 인자에 쉼표로 여러 파일을 넘길 수 있다.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
// 기본 axios에 공공데이터포털 보조 인증키 전환 적용
require('../services/dataGoKrKey');
const { inferSpotCategoriesWithFallback } = require('../constants/spotCategoryRules');

const DURUNUBI_BASE_URL = 'http://apis.data.go.kr/B551011/Durunubi';
const KAKAO_LOCAL_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const CURATED_PATH = path.join(__dirname, '../constants/durunubiSpotMappings.curated.json');
const CANDIDATE_RADIUS_M = Number(process.env.DURUNUBI_CURATE_RADIUS || 500);

const durunubiKey =
  process.env.DURUNUBI_SERVICE_KEY ||
  process.env.TOURAPI_SERVICE_KEY ||
  process.env.TOUR_API_SERVICE_KEY ||
  process.env.TOUR_API_KEY ||
  '';
const kakaoKey = process.env.KAKAO_REST_API_KEY;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchDurunubiCourses() {
  const courses = [];
  for (let pageNo = 1; ; pageNo += 1) {
    const { data } = await axios.get(`${DURUNUBI_BASE_URL}/courseList`, {
      params: {
        serviceKey: durunubiKey,
        MobileOS: 'ETC',
        MobileApp: 'WalkBuddy',
        _type: 'json',
        pageNo,
        numOfRows: 100,
      },
      timeout: 30000,
    });
    const body = data?.response?.body;
    const items = [].concat(body?.items?.item || []);
    courses.push(...items);
    if (!items.length || pageNo * 100 >= Number(body?.totalCount || 0)) break;
  }
  return courses;
}

async function fetchGpxPoints(gpxPath) {
  const { data } = await axios.get(gpxPath, { responseType: 'text', timeout: 30000 });
  // IMPORTANT: 같은 경로를 트랙(trkpt)과 웨이포인트(wpt)로 두 번 담은 GPX가 있어, 셋을 이어 붙이면 경로가 앞뒤로 오간다.
  // 트랙이 있으면 트랙만, 없으면 루트, 그것도 없으면 웨이포인트를 쓴다. (import-durunubi-courses.js 와 같은 기준)
  const read = (tag) => {
    const points = [];
    const pointRegex = new RegExp(`<${tag}\\b[^>]*\\blat=["']([-0-9.]+)["'][^>]*\\blon=["']([-0-9.]+)["'][^>]*>`, "gi");
    let match;
    while ((match = pointRegex.exec(String(data))) !== null) {
      points.push({ lat: Number(match[1]), lng: Number(match[2]) });
    }
    return points;
  };
  for (const tag of ["trkpt", "rtept", "wpt"]) {
    const points = read(tag);
    if (points.length >= 2) return points;
  }
  return [];
}

// 경로 근처 계산용 평면 근사 (수십 km 범위에서 오차 무시 가능)
function project(point, origin) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (point.lng - origin.lng) * mPerDegLng, y: (point.lat - origin.lat) * mPerDegLat };
}

function buildRoute(points) {
  const origin = points[0];
  const projected = points.map((p) => project(p, origin));
  const cumulative = [0];
  for (let i = 1; i < projected.length; i += 1) {
    const dx = projected[i].x - projected[i - 1].x;
    const dy = projected[i].y - projected[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  return { origin, projected, cumulative, length: cumulative[cumulative.length - 1] };
}

// 장소에서 경로까지의 최단거리와, 경로상 투영점의 시작점 기준 거리
function locateOnRoute(route, point) {
  const p = project(point, route.origin);
  let best = { distance: Infinity, along: 0 };
  for (let i = 1; i < route.projected.length; i += 1) {
    const a = route.projected[i - 1];
    const b = route.projected[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen2 = dx * dx + dy * dy;
    const t = segLen2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLen2));
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (distance < best.distance) {
      best = { distance, along: route.cumulative[i - 1] + t * Math.sqrt(segLen2) };
    }
  }
  return {
    routeDistance: Math.round(best.distance),
    distanceFromStartM: Math.round(best.along),
    routeProgress: route.length > 0 ? Number((best.along / route.length).toFixed(6)) : 0,
  };
}

async function searchKakao(query, near) {
  const params = { query, size: 15, page: 1 };
  if (near) Object.assign(params, { x: near.lng, y: near.lat, radius: 20000 });
  const { data } = await axios.get(KAKAO_LOCAL_SEARCH_URL, {
    params,
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
    timeout: 15000,
  });
  return data.documents || [];
}

async function collectCandidates(queriesPath, outPath) {
  const queries = readJson(queriesPath);
  const allCourses = await fetchDurunubiCourses();
  const output = {};

  for (const [crsIdx, names] of Object.entries(queries)) {
    const course = allCourses.find((c) => c.crsIdx === crsIdx);
    if (!course) {
      console.warn(`[skip] 두루누비 목록에 없는 crsIdx: ${crsIdx}`);
      continue;
    }

    const points = await fetchGpxPoints(course.gpxpath);
    const route = buildRoute(points);
    const midpoint = points[Math.floor(points.length / 2)];
    const region = String(course.sigun || '').split(/\s+/).slice(0, 2).join(' ');

    const candidates = {};
    for (const name of names) {
      const seen = new Map();
      for (const [query, near] of [[name, midpoint], [`${region} ${name}`, null]]) {
        for (const doc of await searchKakao(query, near)) {
          if (seen.has(doc.id)) continue;
          const position = locateOnRoute(route, { lat: Number(doc.y), lng: Number(doc.x) });
          if (position.routeDistance > CANDIDATE_RADIUS_M) continue;
          seen.set(doc.id, {
            kakaoPlaceId: String(doc.id),
            canonicalName: doc.place_name,
            kakaoCategoryName: doc.category_name || null,
            categories: inferSpotCategoriesWithFallback(doc),
            address: doc.road_address_name || doc.address_name || null,
            x: doc.x,
            y: doc.y,
            ...position,
          });
        }
      }
      candidates[name] = [...seen.values()].sort((a, b) => a.routeDistance - b.routeDistance);
    }

    output[crsIdx] = {
      courseName: course.crsKorNm,
      sigun: course.sigun,
      routeLengthM: Math.round(route.length),
      candidates,
    };
    console.log(`[candidates] ${course.crsKorNm}: ${Object.values(candidates).flat().length}개`);
  }

  writeJson(outPath, output);
  console.log(`후보 저장: ${outPath}`);
}

function mergeCandidateFiles(paths) {
  const merged = {};
  for (const filePath of paths) {
    for (const [crsIdx, course] of Object.entries(readJson(filePath))) {
      if (!merged[crsIdx]) merged[crsIdx] = { ...course, candidates: {} };
      Object.assign(merged[crsIdx].candidates, course.candidates);
    }
  }
  return merged;
}

function buildCurated(candidatesPaths, picksPath) {
  const candidates = mergeCandidateFiles(candidatesPaths.split(','));
  const picks = readJson(picksPath);
  const curated = fs.existsSync(CURATED_PATH) ? readJson(CURATED_PATH) : { courses: {} };

  for (const [crsIdx, coursePicks] of Object.entries(picks)) {
    const courseCandidates = candidates[crsIdx];
    if (!courseCandidates) throw new Error(`후보 파일에 없는 crsIdx: ${crsIdx}`);

    const byPlaceId = new Map(
      Object.values(courseCandidates.candidates).flat().map((c) => [c.kakaoPlaceId, c])
    );

    const spots = coursePicks.map((pick) => {
      const candidate = byPlaceId.get(String(pick.kakaoPlaceId));
      if (!candidate) throw new Error(`${courseCandidates.courseName}: 후보에 없는 kakaoPlaceId ${pick.kakaoPlaceId}`);
      const categories = pick.categories?.length ? pick.categories : candidate.categories;
      if (!categories?.length) throw new Error(`${candidate.canonicalName}: 앱 카테고리를 추론할 수 없음 (picks 에 categories 지정)`);
      return {
        sourceName: pick.sourceName,
        status: pick.status === 'nearby' ? 'nearby' : 'mapped',
        // 'start' | 'end': 거리와 상관없이 이 스팟을 출발/도착 지점으로 사용
        endpoint: ['start', 'end'].includes(pick.endpoint) ? pick.endpoint : null,
        note: pick.note || null,
        mapping: {
          kakaoPlaceId: candidate.kakaoPlaceId,
          canonicalName: pick.canonicalName || candidate.canonicalName,
          kakaoCategoryName: candidate.kakaoCategoryName,
          categories,
          address: candidate.address,
          x: candidate.x,
          y: candidate.y,
          routeDistance: candidate.routeDistance,
          routeProgress: candidate.routeProgress,
          distanceFromStartM: candidate.distanceFromStartM,
          // 알고 있으면 넣어 둔다. 스팟 보강 때 TourAPI 매칭 검색을 생략한다.
          ...(pick.tourApiContentId ? { tourApiContentId: String(pick.tourApiContentId) } : {}),
        },
      };
    }).sort((a, b) => a.mapping.routeProgress - b.mapping.routeProgress);

    curated.courses[crsIdx] = {
      courseName: courseCandidates.courseName,
      curatedAt: new Date().toISOString().slice(0, 10),
      spots,
    };
    console.log(`[curated] ${courseCandidates.courseName}: ${spots.map((s) => s.mapping.canonicalName).join(' → ')}`);
  }

  writeJson(CURATED_PATH, curated);
  console.log(`큐레이션 저장: ${CURATED_PATH}`);
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'candidates' && args.length === 2) {
    if (!durunubiKey || !kakaoKey) throw new Error('DURUNUBI(TOURAPI) 키와 KAKAO_REST_API_KEY가 필요합니다.');
    await collectCandidates(args[0], args[1]);
  } else if (mode === 'build' && args.length === 2) {
    buildCurated(args[0], args[1]);
  } else {
    console.log('사용법:\n  candidates <queries.json> <candidates.json>\n  build <candidates.json> <picks.json>');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`두루누비 큐레이션 실패: ${err.message}`);
  process.exitCode = 1;
});
