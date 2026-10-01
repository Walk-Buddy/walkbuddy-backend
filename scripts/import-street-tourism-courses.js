require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pool = require('../config/db');
const { requireTagId } = require('../constants/tagAliases');
const spotService = require('../services/spotService');
const courseTagService = require('../services/courseTagService');
const { WALK_METERS_PER_MINUTE } = require('../constants/courseConstants');
const {
  extractRegionFromAddress,
  inferSpotCategoriesWithFallback,
} = require('../constants/spotCategoryRules');

const API_BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_stret_tursm_info_api';
const DATA_SOURCE = '행정안전부_전국길관광정보표준데이터';
const COURSE_TAG_NAME = '추천코스'; // 정본 태그 (DB tags). 코스 분류(category)는 '관광코스' 그대로
const DEFAULT_PAGE_SIZE = 100;

// CLI 옵션 파싱
const args = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  const match = args.find((a) => a.startsWith(`--${prefix}=`));
  if (match) return match.split('=')[1];
  return fallback;
}
const isDryRun = args.includes('--dry-run');
const withSpots = !args.includes('--no-spots'); // 기본적으로 스팟 등록 활성화
const targetRegionArg = (getArg('region', process.env.STREET_TOURISM_REGION || 'all')).toLowerCase();
const limitArg = Number.parseInt(getArg('limit', process.env.STREET_TOURISM_LIMIT || '0'), 10);
// 대상 코스 중 몇 번째부터 처리할지 (0부터). 하루 T맵·TourAPI 한도에 맞춰 나눠 넣을 때 사용
// 예: --region=seoul --start=0 --limit=90, 다음 날 --region=seoul --start=90
const startArg = Math.max(0, Number.parseInt(getArg('start', '0'), 10) || 0);
// 예상 소요시간이 이보다 긴 코스는 넣지 않는다 (기본 5시간). 0 이면 제한 없음
const maxMinutes = Number.parseInt(getArg('max-minutes', process.env.COURSE_MAX_MINUTES || '300'), 10) || 0;

const serviceKey =
  process.env.TOURAPI_SERVICE_KEY ||
  process.env.TOUR_API_SERVICE_KEY ||
  process.env.DURUNUBI_SERVICE_KEY;

const kakaoKey = process.env.KAKAO_REST_API_KEY;
const tmapKey = process.env.TMAP_API_KEY;

function requireEnv() {
  if (!serviceKey) {
    throw new Error('TOURAPI_SERVICE_KEY(또는 TOUR_API_SERVICE_KEY)가 .env에 설정되지 않았습니다.');
  }
}

// ──────────────────────────────────────────────────────────
// 1. 공공데이터 API 호출
// ──────────────────────────────────────────────────────────
async function fetchPage(pageNo) {
  const url = `${API_BASE_URL}?serviceKey=${encodeURIComponent(serviceKey)}&type=json&pageNo=${pageNo}&numOfRows=${DEFAULT_PAGE_SIZE}`;
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const header = res.data?.header || res.data?.response?.header;
    const body = res.data?.body || res.data?.response?.body;

    if (header && header.resultCode !== '00' && header.resultCode !== '0000') {
      throw new Error(`API 호출 실패: [${header.resultCode}] ${header.resultMsg}`);
    }

    const raw = body?.items?.item || [];
    const items = Array.isArray(raw) ? raw : [raw];
    return {
      totalCount: Number(body?.totalCount || 0),
      items: items.filter(Boolean),
    };
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('전국길관광정보 API 인증 실패: 서비스 키를 확인해주세요.');
    }
    throw err;
  }
}

async function fetchAllStreetTourismItems() {
  console.log('📡 전국길관광정보표준데이터 API 데이터 수집 시작...');
  const first = await fetchPage(1);
  const totalCount = first.totalCount || first.items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));
  const allItems = [...first.items];

  console.log(`총 ${totalCount}건의 데이터 확인 (${totalPages}페이지)`);

  for (let page = 2; page <= totalPages; page += 1) {
    const p = await fetchPage(page);
    allItems.push(...p.items);
  }

  return allItems;
}

// ──────────────────────────────────────────────────────────
// 2. 지역 및 권역 필터링 (서울, 춘천)
// ──────────────────────────────────────────────────────────
function filterTargetItems(items) {
  return items.filter((item) => {
    const text = [
      item.insttNm,
      item.institutionNm,
      item.beginRdnmadr,
      item.beginLnmadr,
      item.endRdnmadr,
      item.endLnmadr,
      item.stretNm,
      item.coursInfo,
    ]
      .filter(Boolean)
      .join(' ');

    const isSeoul = text.includes('서울');
    const isChuncheon = text.includes('춘천');

    if (targetRegionArg === 'seoul') return isSeoul;
    if (targetRegionArg === 'chuncheon') return isChuncheon;
    return isSeoul || isChuncheon;
  });
}

const SEOUL_GU_LIST = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구',
  '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구',
  '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'
];

function resolveCourseRegion(item) {
  const text = [
    item.beginRdnmadr,
    item.beginLnmadr,
    item.insttNm,
    item.institutionNm,
    item.stretNm,
    item.endRdnmadr,
    item.endLnmadr,
    item.coursInfo,
  ]
    .filter(Boolean)
    .join(' ');

  // 1. 춘천
  if (text.includes('춘천')) {
    let sub = null;
    if (text.includes('의암') || text.includes('공지천') || text.includes('삼천동') || text.includes('근화동') || text.includes('칠전동')) {
      sub = '의암호·공지천권';
    } else if (text.includes('소양') || text.includes('신북') || text.includes('사북') || text.includes('우두') || text.includes('신사우')) {
      sub = '소양강·신북권';
    } else if (text.includes('구봉산') || text.includes('동면') || text.includes('만천') || text.includes('장학')) {
      sub = '동면·구봉산권';
    } else if (text.includes('강촌') || text.includes('남산') || text.includes('남면') || text.includes('김유정') || text.includes('신동면') || text.includes('구곡')) {
      sub = '강촌·남산권';
    } else if (text.includes('명동') || text.includes('중앙로') || text.includes('효자') || text.includes('퇴계') || text.includes('석사') || text.includes('온의') || text.includes('약사')) {
      sub = '도심·명동권';
    } else {
      sub = '도심·명동권';
    }
    return { region: '춘천', sub_region: sub };
  }

  // 2. 서울 (25개 구 정확 일치 우선)
  for (const gu of SEOUL_GU_LIST) {
    if (text.includes(gu)) {
      return { region: '서울', sub_region: gu };
    }
  }

  const fallback = extractRegionFromAddress(text);
  return {
    region: '서울',
    sub_region: fallback?.sub_region || null,
  };
}

// ──────────────────────────────────────────────────────────
// 3. 지오코딩 및 카카오 스팟 후보 탐색
//
//   ⚠️ 오매칭 방지: 키워드 검색(전국 대상)은 동명이소/유명 장소를
//   엉뚱한 지역에서 반환할 수 있다. (예: 춘천 코스의 '봉황대' →
//   경남 의령의 '봉황대') 따라서 지역 경계 박스(bbox)로 좌표를
//   반드시 검증하고, bbox 밖 결과는 버린다.
// ──────────────────────────────────────────────────────────
const placeCache = new Map();

// 지역별 좌표 경계 박스 (남/북 위도, 서/동 경도) + 여유 마진
//  - 서울: 대략 lat 37.42~37.70, lng 126.76~127.20
//  - 춘천: 대략 lat 37.60~38.15, lng 127.45~128.05
const REGION_BBOX = {
  서울: { minLat: 37.40, maxLat: 37.72, minLng: 126.74, maxLng: 127.24 },
  춘천: { minLat: 37.55, maxLat: 38.20, minLng: 127.35, maxLng: 128.12 },
};

function isWithinRegion(lat, lng, region) {
  const bbox = REGION_BBOX[region];
  if (!bbox) return true; // 정의되지 않은 지역은 검증 생략
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

// ── 경유지 이름 정리 ───────────────────────────────────────
// 장소명이 아닌 괄호 안 메모 (예: "(월 휴관)", "(공사중, `24.6.30.)", "(평일 비개방)")
const NOTE_PATTERN = /휴관|공사|비개방|개방|촬영지|방향|예정|운영|`|\d{2}\.\d/;
// 장소 자체가 아닌 부속시설·상업시설로 잘못 매칭되는 카카오 카테고리
const EXCLUDED_KAKAO_CATEGORY_PATTERN = /편의점|주차장|화장실|충전소|숙박|매표소|퀵서비스|노인|식품판매|입출구|^부동산 > (?!빌딩)|^음식점/;
const FACILITY_SUFFIX_PATTERN = /(주차장|공중화장실|화장실|입구|출입구|매점|매표소|관리사무소|정류장|점)$/;
const PREFERRED_CATEGORY_PATTERN = /^(여행|문화,예술|종교|교육,학문|사회,공공기관)/;
const MAX_INTERMEDIATE_STOPS = 12;

// 사람이 확인한 경유 지점 (카카오에 없는 옛터·표지석, 다른 이름으로 등록된 장소)
const CURATED_PATH = path.join(__dirname, '../constants/streetTourismCourses.curated.json');
const CURATED_COURSES = fs.existsSync(CURATED_PATH)
  ? JSON.parse(fs.readFileSync(CURATED_PATH, 'utf8')).courses || {}
  : {};

// 큐레이션 항목 → 경유 지점 (skip 이면 null)
//  - kakao: 카카오 장소로 저장, label 은 타임라인 표시 이름
//  - pin:   이름 있는 좌표 핀
function placeFromCuration(stop, curated, region, subRegion) {
  if (curated.skip) return null;
  const label = curated.label || stop.replace(/\([^)]*\)/g, '').trim();
  if (curated.kakao) {
    const k = curated.kakao;
    const place = toPlace(
      { id: k.id, place_name: k.name, category_name: k.categoryName, road_address_name: k.address, x: k.x, y: k.y },
      region,
      subRegion
    );
    if (curated.categories?.length) place.categories = curated.categories;
    return { ...place, label };
  }
  return { name: label, label, x: Number(curated.pin.lng), y: Number(curated.pin.lat) };
}

function normalizeName(name = '') {
  return String(name)
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s·ㆍ.,'"`]/g, '')
    .toLowerCase();
}

// coursInfo 를 경유 지점 목록으로 자른다. 화살표가 있으면 화살표만 구분자로 쓴다.
// (화살표가 없는 코스는 "-", "~", ">" 를 구분자로 사용. 쉼표는 한 지점 안의 나열로 본다)
function splitCourseStops(coursInfo) {
  const text = String(coursInfo || '').trim();
  if (!text) return [];
  const parts = /→/.test(text) ? text.split(/→+/) : text.split(/\s*(?:-|~|>)+\s*/);
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 2 && !/^(출발|도착|종착지?)$/.test(part));
}

// 묘역 이름에서 인물 이름만 남길 때 빼는 단어 (호·존칭·일반 명사)
const GRAVE_GENERIC_TOKENS = new Set(['선생', '열사', '의사', '지사', '여사', '묘역', '묘소', '묘', '합동']);

// 한 경유 지점의 검색어 후보. { query, graveName } 목록을 돌려준다.
//  1) 괄호 제거한 이름, 괄호 안 별칭, 쉼표/및 으로 나뉜 각 장소
//  2) "OO 터" → "OO터"
//  3) 마지막 설명어를 뺀 이름 ("한글가온길 새김돌" → "한글가온길")
//  4) 묘역: 카카오는 "OO 묘소"/"OO묘"로 등록 → 인물 이름 + 묘소 로 검색하고 카테고리로 검증
function buildStopQueries(stop) {
  const queries = [];
  const aliases = [...String(stop).matchAll(/\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((alias) => alias.length >= 2 && !NOTE_PATTERN.test(alias));
  const base = String(stop).replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim();

  const pieces = [base, ...aliases, ...base.split(/\s*,\s*|\s+및\s+/)];
  for (const piece of pieces) {
    const name = piece.trim();
    // "최린" 처럼 사람 이름만 남은 짧은 조각은 검색하지 않는다.
    if (normalizeName(name).length < 3) continue;
    queries.push({ query: name });
    if (/\s터$/.test(name)) queries.push({ query: name.replace(/\s터$/, '터') });

    const tokens = name.split(' ');
    if (/묘역|묘소/.test(name)) {
      // "성재 이시영 선생 묘역" → 이시영, "일성 이준열사 묘역" → 이준
      const people = tokens
        .map((token) => token.replace(/(선생|열사|의사|지사|여사)$/, ''))
        .filter((token) => token.length >= 2 && !GRAVE_GENERIC_TOKENS.has(token));
      // 호(號)는 보통 이름 앞에 오므로 마지막 인물 토큰부터 시도
      for (const person of people.reverse()) {
        queries.push({ query: `${person} 묘소`, graveName: person });
      }
    } else if (tokens.length >= 2) {
      const withoutLast = tokens.slice(0, -1).join(' ');
      if (normalizeName(withoutLast).length >= 3) queries.push({ query: withoutLast });
    }
  }

  const seen = new Set();
  return queries.filter(({ query }) => (seen.has(query) ? false : seen.add(query)));
}

// 묘역 검색 결과 검증: 무덤 카테고리이고 이름에 인물 이름이 있어야 같은 곳으로 본다.
function getGraveScore(graveName, doc) {
  const isGrave = /릉,묘,총/.test(String(doc.category_name || ''));
  return isGrave && normalizeName(doc.place_name).includes(normalizeName(graveName)) ? 75 : 0;
}

function getNameScore(query, placeName) {
  const expected = normalizeName(query);
  const actual = normalizeName(placeName);
  if (!expected || !actual) return 0;
  if (expected === actual) return 100;
  if (actual.includes(expected)) {
    if (FACILITY_SUFFIX_PATTERN.test(actual) && !actual.endsWith(expected)) return 0;
    return Math.max(55, 85 - (actual.length - expected.length) * 3);
  }
  if (expected.includes(actual)) return actual.length >= 3 ? 65 : 0;
  return 0;
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toPlace(doc, region, subRegion) {
  const categories = inferSpotCategoriesWithFallback(doc);
  return {
    kakao_place_id: String(doc.id),
    name: doc.place_name,
    kakao_category_name: doc.category_name || null,
    categories: categories.length > 0 ? categories : ['공원·광장'],
    address: doc.road_address_name || doc.address_name || null,
    x: Number(doc.x),
    y: Number(doc.y),
    region,
    sub_region: subRegion,
  };
}

async function kakaoGet(path, params) {
  const cacheKey = `${path}:${JSON.stringify(params)}`;
  if (!placeCache.has(cacheKey)) {
    placeCache.set(cacheKey, axios.get(`https://dapi.kakao.com/v2/local/search/${path}.json`, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      params,
      timeout: 5000,
    }).then((res) => res.data?.documents || []).catch(() => []));
  }
  return placeCache.get(cacheKey);
}

// 주소 → 좌표 (출발/도착 기준점)
async function geocodeAddress(addr, region) {
  if (!kakaoKey || !addr) return null;
  const doc = (await kakaoGet('address', { query: addr.trim() }))[0];
  if (!doc?.x || !doc?.y) return null;
  const point = { lat: Number(doc.y), lng: Number(doc.x) };
  return isWithinRegion(point.lat, point.lng, region) ? point : null;
}

/**
 * 기준점(출발지) 주변에서만 장소를 찾고, 이름이 맞는 후보 중 직전 지점에서 가장 가까운 곳을 고른다.
 *  - anchor: 검색 중심 (출발지 좌표). 없으면 지역 bbox 안 전체 검색
 *  - prev:   직전 경유 지점 좌표 (동점 후보 중 가까운 곳 선택)
 *  - maxDistance: 기준점에서 이보다 멀면 다른 곳의 동명 장소로 보고 버림
 */
async function findStopPlace(stop, { region, subRegion, anchor, prev, maxDistance }) {
  if (!kakaoKey) return null;

  const candidates = [];
  for (const { query, graveName } of buildStopQueries(stop)) {
    const searches = anchor
      ? [{ query, x: anchor.lng, y: anchor.lat, radius: Math.min(20000, Math.round(maxDistance)), size: 15 }]
      : [{ query: `${region} ${subRegion || ''} ${query}`.replace(/\s+/g, ' '), size: 15 }];

    for (const params of searches) {
      for (const doc of await kakaoGet('keyword', params)) {
        const point = { lat: Number(doc.y), lng: Number(doc.x) };
        if (!isWithinRegion(point.lat, point.lng, region)) continue;
        if (EXCLUDED_KAKAO_CATEGORY_PATTERN.test(String(doc.category_name || ''))) continue;
        if (anchor && distanceMeters(anchor, point) > maxDistance) continue;

        const nameScore = graveName ? getGraveScore(graveName, doc) : getNameScore(query, doc.place_name);
        if (nameScore < 55) continue;
        // 길 관광 경유지는 대부분 관광지·문화시설·종교시설·공공기관이므로 이름이 비슷하면 우선한다.
        // (예: "YMCA" → 옷가게 "YMCA유니폼" 대신 "서울YMCA 별관")
        const score = nameScore + (PREFERRED_CATEGORY_PATTERN.test(String(doc.category_name || '')) ? 10 : 0);
        candidates.push({ doc, point, score, nameScore, prevDistance: prev ? distanceMeters(prev, point) : 0 });
      }
    }
    // 정확히 일치하는 후보가 있으면 다음 검색어는 보지 않는다.
    if (candidates.some((c) => c.nameScore === 100)) break;
  }

  if (!candidates.length) return null;
  const bestScore = Math.max(...candidates.map((c) => c.score));
  // 이름 점수가 거의 같은 후보끼리만 직전 지점과의 거리로 고른다.
  const best = candidates
    .filter((c) => c.score >= bestScore - 5)
    .sort((a, b) => a.prevDistance - b.prevDistance || b.score - a.score)[0];
  return toPlace(best.doc, region, subRegion);
}

// ──────────────────────────────────────────────────────────
// 4. 경로(LineString) 생성 (Tmap 도보 경로 연동)
// ──────────────────────────────────────────────────────────
// 원본 소요시간 문구("2시간", "1시간30분", "45분", "1.5") → 분. 없거나 못 읽으면 null
function parseOfficialMinutes(reqreTime) {
  const text = String(reqreTime || '').trim();
  if (!text) return null;
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*시간/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+)\s*분/)?.[1] || 0);
  if (hours || minutes) return Math.round(hours * 60 + minutes);
  const num = Number.parseFloat(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? Math.round(num * 60) : null;
}

// T맵 보행자 경로는 보도·골목 중심이라 등산로·임도 같은 산길을 모른다.
// 경유 지점을 이 비율 미만으로 찾았거나 원본 거리와 이 범위를 벗어나면 산길 코스로 보고 원본 거리·시간을 쓴다.
const MIN_MATCHED_STOP_RATIO = 0.6;
// 코스명·경유 경로에 이런 말이 있으면 산길 코스 (T맵 보행자 경로가 모르는 길)
const TRAIL_COURSE_PATTERN = /둘레길|자락길|숲길|산길|등산|임도|봄내길|트레킹|산책로\s*\(?산|오름|능선/;
const OFFICIAL_LENGTH_RATIO_RANGE = [0.6, 1.6];

// T맵 경로를 받지 못한 구간(직선 연결)은 T맵과 같은 도보 속도로 계산
const FALLBACK_WALK_METERS_PER_MINUTE = WALK_METERS_PER_MINUTE;

async function fetchTmapPedestrianRoute(from, to) {
  if (!tmapKey) return null;

  try {
    const res = await axios.post(
      'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1',
      {
        startX: String(from.lng),
        startY: String(from.lat),
        endX: String(to.lng),
        endY: String(to.lat),
        startName: '출발',
        endName: '도착',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0',
      },
      {
        headers: {
          appKey: tmapKey,
          'Content-Type': 'application/json',
        },
        timeout: 7000,
      }
    );

    const coords = [];
    const features = res.data?.features || [];
    for (const f of features) {
      if (f.geometry?.type === 'LineString') {
        for (const [lng, lat] of f.geometry.coordinates) {
          coords.push({ lng, lat });
        }
      }
    }
    if (coords.length < 2) return null;

    // 출발 지점 feature 의 properties 에 구간 전체 거리(m)·시간(초)이 들어 있다.
    const summary = features.find((f) => Number.isFinite(Number(f.properties?.totalDistance)))?.properties;
    return {
      coords,
      distanceM: summary ? Number(summary.totalDistance) : null,
      timeSec: summary ? Number(summary.totalTime) : null,
    };
  } catch (_) {
    return null;
  }
}

async function buildCourseRoute(waypointsList) {
  const points = waypointsList.map((w) => ({ lat: w.lat, lng: w.lng }));
  if (points.length === 0) return null;

  if (points.length === 1) {
    points.push({
      lat: points[0].lat + 0.0004,
      lng: points[0].lng + 0.0004,
    });
  }

  // 코스 거리·소요시간은 T맵 도보 경로의 구간별 거리·시간을 더해서 구한다.
  // T맵 경로를 받지 못한 구간은 직선으로 잇고 직선거리·기본 도보 속도로 계산한다.
  const finalCoords = [];
  let distanceM = 0;
  let timeSec = 0;
  let fallbackSegments = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const tmapSegment = tmapKey ? await fetchTmapPedestrianRoute(p1, p2) : null;

    if (tmapSegment) {
      finalCoords.push(...tmapSegment.coords);
      const segmentDistance = tmapSegment.distanceM
        ?? tmapSegment.coords.slice(1).reduce((sum, p, idx) => sum + distanceMeters(tmapSegment.coords[idx], p), 0);
      distanceM += segmentDistance;
      timeSec += tmapSegment.timeSec ?? (segmentDistance / FALLBACK_WALK_METERS_PER_MINUTE) * 60;
    } else {
      finalCoords.push(p1, p2);
      const segmentDistance = distanceMeters(p1, p2);
      distanceM += segmentDistance;
      timeSec += (segmentDistance / FALLBACK_WALK_METERS_PER_MINUTE) * 60;
      fallbackSegments += 1;
    }
  }

  const MAX_POINTS = 1200;
  let sampled = finalCoords;
  if (finalCoords.length > MAX_POINTS) {
    sampled = [];
    const lastIdx = finalCoords.length - 1;
    for (let i = 0; i < MAX_POINTS; i += 1) {
      const srcIdx = Math.round((i * lastIdx) / (MAX_POINTS - 1));
      sampled.push(finalCoords[srcIdx]);
    }
  }

  const wkt = `SRID=4326;LINESTRING(${sampled.map((p) => `${p.lng} ${p.lat}`).join(', ')})`;
  return {
    wkt,
    points: sampled,
    distanceM: Math.max(1, Math.round(distanceM)),
    durationMin: Math.max(1, Math.round(timeSec / 60)),
    fallbackSegments,
  };
}

// ──────────────────────────────────────────────────────────
// 5. DB 삽입 및 관리자 확인
// ──────────────────────────────────────────────────────────
async function ensureAdminUser(client) {
  const { rows: admins } = await client.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`
  );
  if (admins.length) return admins[0].user_id;

  const { rows: seedAdmins } = await client.query(
    `SELECT user_id FROM users WHERE social_provider = 'seed' AND social_id = 'public-admin' LIMIT 1`
  );
  if (seedAdmins.length) return seedAdmins[0].user_id;

  const { rows: created } = await client.query(
    `INSERT INTO users (nickname, social_provider, social_id, role, status)
     VALUES ('공공데이터관리', 'seed', 'public-admin', 'admin', 'active')
     RETURNING user_id`
  );
  return created[0].user_id;
}

// 정본 태그만 쓴다 (태그를 새로 만들지 않는다 — DB 정본 태그 — constants/tagAliases.js)
async function ensureCourseTag(client) {
  return requireTagId(client, COURSE_TAG_NAME, 'course');
}

// 서버에서 넣는 공공데이터 코스는 항상 '공식코스' 태그를 붙인다.
// (자동 태그 단계가 실패해도 빠지지 않도록 코스 저장과 같은 트랜잭션에서 직접 연결)
async function ensureOfficialCourseTag(client) {
  return requireTagId(client, '공식코스', 'course');
}

function buildCourseDescription(item) {
  const parts = [];
  // 경유 경로·출발/도착·소요 시간은 코스 상세 화면(타임라인, 출발→도착, 소요시간 박스)에
  // 이미 나오므로 설명에는 넣지 않는다.
  if (item.stretIntrcn) parts.push(item.stretIntrcn.trim());
  if (item.institutionNm) parts.push(`🏛️ 관리 기관: ${item.institutionNm.trim()}`);
  if (item.phoneNumber) parts.push(`📞 문의 전화: ${item.phoneNumber.trim()}`);

  return parts.join('\n\n') || null;
}

async function insertCourseWaypoints(client, courseId, waypointsList) {
  await client.query(`DELETE FROM course_waypoints WHERE course_id = $1`, [courseId]);

  for (let i = 0; i < waypointsList.length; i += 1) {
    const w = waypointsList[i];
    const seq = i + 1;

    if (w.spotId) {
      await client.query(
        `INSERT INTO course_waypoints (course_id, seq, type, spot_id, lat, lng, name)
         VALUES ($1, $2, 'spot', $3, NULL, NULL, $4)`,
        [courseId, seq, w.spotId, w.name || null]
      );
    } else {
      await client.query(
        `INSERT INTO course_waypoints (course_id, seq, type, spot_id, lat, lng, name)
         VALUES ($1, $2, 'pin', NULL, $3, $4, $5)`,
        [courseId, seq, w.lat, w.lng, w.name || null]
      );
    }
  }
}

// ──────────────────────────────────────────────────────────
// 6. 메인 실행 함수
// ──────────────────────────────────────────────────────────
async function main() {
  requireEnv();

  console.log(`🚀 [전국길관광정보 표준데이터] 코스 및 스팟 적재 프로세스 시작`);
  console.log(`- 대상 지역: ${targetRegionArg.toUpperCase()}`);
  console.log(`- 경유지 스팟 등록: ${withSpots ? 'ON (TourAPI 관광정보 연동)' : 'OFF (단순 핀 좌표만)'}`);
  console.log(`- 드라이런 모드: ${isDryRun ? 'ON (DB 저장 안함)' : 'OFF (DB 직접 적재)'}`);
  if (startArg > 0) console.log(`- 시작 위치: ${startArg + 1}번째 코스부터`);
  if (limitArg > 0) console.log(`- 제한 수량: ${limitArg}개`);

  const allItems = await fetchAllStreetTourismItems();
  let targetItems = filterTargetItems(allItems);

  console.log(`\n🔍 서울 및 춘천 필터링 결과: 총 ${targetItems.length}건 발굴`);

  if (startArg > 0 || limitArg > 0) {
    targetItems = targetItems.slice(startArg, limitArg > 0 ? startArg + limitArg : undefined);
    console.log(`- 범위 적용 후: ${startArg + 1}번째부터 ${targetItems.length}건 처리 예정`);
  }

  const client = isDryRun ? null : await pool.connect();
  let ownerId = null;
  let tagIds = [];

  if (client) {
    ownerId = await ensureAdminUser(client);
    tagIds = [await ensureCourseTag(client), await ensureOfficialCourseTag(client)];
  }

  const stats = {
    total: targetItems.length,
    success: 0,
    spotsSaved: 0,
    tourEnriched: 0,
    skipped: 0,
    failed: 0,
    unmatchedStops: 0,
    officialUsed: 0,
  };

  try {
    for (let i = 0; i < targetItems.length; i += 1) {
      const item = targetItems[i];
      const courseName = (item.stretNm || '').trim();
      const sourceId = `${item.insttCode || 'INST'}_${courseName.replace(/[\s/]/g, '_')}`;

      console.log(`\n-------------------------------------------------------------`);
      console.log(`[${i + 1}/${targetItems.length}] 코스: "${courseName}"`);

      if (!courseName) {
        console.log('❌ [스킵] 코스명 없음');
        stats.skipped += 1;
        continue;
      }

      // 원본 소요시간이 이미 제한을 넘으면 장소 검색·저장 전에 건너뛴다 (쓸모없는 장소가 쌓이지 않게)
      const officialMinutes = parseOfficialMinutes(item.reqreTime);
      if (maxMinutes > 0 && officialMinutes && officialMinutes > maxMinutes) {
        console.log(`❌ [스킵] 원본 소요시간 ${officialMinutes}분 > ${maxMinutes}분`);
        stats.skipped += 1;
        continue;
      }

      const { region, sub_region } = resolveCourseRegion(item);
      console.log(`📍 권역: ${region} (${sub_region || '기본권역'})`);

      // 경유 지점 정리: coursInfo 순서를 그대로 쓰고, 출발/도착 이름이 빠져 있으면 앞뒤에 붙인다.
      const officialLengthM = Number.parseFloat(item.stretLt) > 0 ? Number.parseFloat(item.stretLt) * 1000 : null;
      // 출발지 기준 검색 반경: 공식 거리(왕복 고려) + 여유
      const maxDistance = Math.max(1500, (officialLengthM || 3000) * 1.2 + 500);
      const startAnchor = await geocodeAddress(item.beginRdnmadr, region) || await geocodeAddress(item.beginLnmadr, region);
      const endAnchor = await geocodeAddress(item.endRdnmadr, region) || await geocodeAddress(item.endLnmadr, region);
      const anchor = startAnchor || endAnchor;

      const stops = splitCourseStops(item.coursInfo);
      const beginName = (item.beginSpotNm || '').trim();
      const endName = (item.endSpotNm || '').trim();
      if (beginName && normalizeName(stops[0]) !== normalizeName(beginName)) stops.unshift(beginName);
      if (endName && normalizeName(stops[stops.length - 1]) !== normalizeName(endName)) stops.push(endName);

      const isCycle = Boolean(
        (beginName && endName && normalizeName(beginName) === normalizeName(endName))
        || (startAnchor && endAnchor && distanceMeters(startAnchor, endAnchor) < 50)
      );

      // 중간 경유지가 너무 많으면 순서를 유지한 채 고르게 줄인다.
      let middleStops = stops.slice(1, -1);
      if (middleStops.length > MAX_INTERMEDIATE_STOPS) {
        const lastIdx = middleStops.length - 1;
        middleStops = [...new Set(Array.from({ length: MAX_INTERMEDIATE_STOPS }, (_, k) =>
          middleStops[Math.round((k * lastIdx) / (MAX_INTERMEDIATE_STOPS - 1))]))];
      }

      const matchedStops = [];
      const unmatchedStops = [];

      // 큐레이션된 지점은 자동 매칭보다 우선한다. (출발·중간·도착 모두)
      const curatedStops = CURATED_COURSES[sourceId]?.stops || {};
      const skippedStops = [];

      // 1. 출발지: 출발 주소 바로 옆(300m)의 같은 이름 장소, 없으면 주소 좌표 핀
      const startName = stops[0] || beginName;
      const startCuration = startName ? curatedStops[startName] : null;
      const startPlace = startCuration
        ? placeFromCuration(startName, startCuration, region, sub_region)
        : startName
          ? await findStopPlace(startName, { region, subRegion: sub_region, anchor: startAnchor, prev: startAnchor, maxDistance: startAnchor ? 300 : maxDistance })
          : null;
      if (startCuration?.skip) skippedStops.push(startName);
      else if (startPlace) matchedStops.push({ stop: startName, place: startPlace, curated: Boolean(startCuration) });
      else if (startAnchor) matchedStops.push({ stop: startName || '출발', place: { name: startName, x: startAnchor.lng, y: startAnchor.lat } });
      else if (startName) unmatchedStops.push(startName);

      // 2. 중간 경유지: 출발지 주변에서 이름이 맞는 곳 중 직전 지점과 가까운 곳
      for (const stop of middleStops) {
        if (curatedStops[stop]) {
          const curatedPlace = placeFromCuration(stop, curatedStops[stop], region, sub_region);
          if (curatedPlace) matchedStops.push({ stop, place: curatedPlace, curated: true });
          else skippedStops.push(stop);
          continue;
        }
        const prevPlace = matchedStops[matchedStops.length - 1]?.place;
        const prev = prevPlace ? { lat: prevPlace.y, lng: prevPlace.x } : anchor;
        const place = await findStopPlace(stop, { region, subRegion: sub_region, anchor, prev, maxDistance });
        if (place) matchedStops.push({ stop, place });
        else unmatchedStops.push(stop);
      }

      // 3. 도착지: 순환 코스는 출발 지점으로 되돌아온다.
      if (isCycle && matchedStops.length > 0) {
        matchedStops.push({ ...matchedStops[0], isLoopEnd: true });
      } else if (stops.length > 1) {
        const lastName = stops[stops.length - 1];
        const endCuration = curatedStops[lastName];
        const endPlace = endCuration
          ? placeFromCuration(lastName, endCuration, region, sub_region)
          : await findStopPlace(lastName, {
            region, subRegion: sub_region, anchor: endAnchor || anchor, prev: endAnchor,
            maxDistance: endAnchor ? 300 : maxDistance,
          });
        if (endCuration?.skip) skippedStops.push(lastName);
        else if (endPlace) matchedStops.push({ stop: lastName, place: endPlace, curated: Boolean(endCuration) });
        else if (endAnchor) matchedStops.push({ stop: lastName, place: { name: lastName, x: endAnchor.lng, y: endAnchor.lat } });
        else unmatchedStops.push(lastName);
      }

      // 각 지점을 스팟으로 저장 (카카오 장소인 경우만, TourAPI 보강 포함)
      const courseWaypointsList = [];
      const savedSpotIds = new Map();

      for (const { place, isLoopEnd } of matchedStops) {
        let spotId = place.kakao_place_id ? savedSpotIds.get(place.kakao_place_id) || null : null;

        if (!spotId && withSpots && place.kakao_place_id && !isDryRun && client) {
          try {
            const saved = await spotService.saveKakaoSpot(place, ownerId);
            if (saved.spot?.spot_id) {
              spotId = saved.spot.spot_id;
              savedSpotIds.set(place.kakao_place_id, spotId);
              stats.spotsSaved += saved.is_created ? 1 : 0;
              if (saved.tour_content_enriched) {
                stats.tourEnriched += 1;
                console.log(`  🌟 [스팟+TourAPI 매칭] ${place.name} -> 관광설명 & 무장애정보 연동`);
              } else {
                console.log(`  🏢 [스팟 등록] ${place.name} (${place.categories.join(',')})`);
              }
            }
          } catch (err) {
            // 스팟 저장 실패 시 핀 좌표로 폴백
          }
        } else if (isDryRun && place.kakao_place_id) {
          console.log(`  🔎 [스팟 후보] ${place.name} (좌표: ${place.x}, ${place.y})`);
        }

        // 연속 동일 좌표 방지 (순환 코스의 도착 지점은 유지)
        const last = courseWaypointsList[courseWaypointsList.length - 1];
        if (!isLoopEnd && last && Math.abs(last.lat - place.y) < 1e-6 && Math.abs(last.lng - place.x) < 1e-6) {
          continue;
        }

        courseWaypointsList.push({
          // 핀은 장소명, 큐레이션 스팟은 코스가 쓰는 이름(label)을 경유지 이름으로 저장
          name: place.label || (spotId ? null : place.name || null),
          lat: place.y,
          lng: place.x,
          spotId,
        });
      }

      const matchedLabels = matchedStops
        .filter(({ isLoopEnd }) => !isLoopEnd)
        .map(({ stop, place, curated }) => {
          const target = place.kakao_place_id ? place.name : '핀';
          return `${stop}→${target}${curated ? '(큐레이션)' : ''}`;
        });
      console.log(`  - 경유 지점 ${stops.length}개 중 연결 ${matchedLabels.length}개: ${matchedLabels.join(', ')}`);
      if (skippedStops.length > 0) {
        console.log(`  - 생략(큐레이션): ${skippedStops.join(', ')}`);
      }
      if (unmatchedStops.length > 0) {
        stats.unmatchedStops += unmatchedStops.length;
        console.log(`  - ⚠️  찾지 못한 지점: ${unmatchedStops.join(', ')}`);
      }

      if (courseWaypointsList.length === 0) {
        console.log('❌ [스킵] 코스 좌표를 식별할 수 없습니다.');
        stats.skipped += 1;
        continue;
      }

      // 보행 경로(LineString) 생성
      const route = await buildCourseRoute(courseWaypointsList);
      if (!route) {
        console.log('❌ [스킵] 경로 geometry 생성 불가');
        stats.skipped += 1;
        continue;
      }

      // 거리·소요시간: 기본은 T맵 도보 경로 기준.
      // 산길 코스(경유 지점 매칭 부족 또는 원본 거리와 차이 큼)는 원본 거리·시간을 쓴다.
      if (route.fallbackSegments > 0) {
        console.log(`  - ⚠️  T맵 경로 실패 구간 ${route.fallbackSegments}개는 직선거리로 계산`);
      }
      const consideredStops = stops.length - skippedStops.length;
      const matchedRatio = consideredStops > 0 ? (consideredStops - unmatchedStops.length) / consideredStops : 1;
      const lengthRatio = officialLengthM ? route.distanceM / officialLengthM : null;
      const lengthOutOfRange = lengthRatio != null
        && (lengthRatio < OFFICIAL_LENGTH_RATIO_RANGE[0] || lengthRatio > OFFICIAL_LENGTH_RATIO_RANGE[1]);
      // 큐레이션으로 지점을 확인한 코스는 원본이 틀린 경우(예: 3.1운동길B 원본 1.0km)라 T맵 값을 유지한다.
      const isCurated = Boolean(CURATED_COURSES[sourceId]);
      const isTrailCourse = TRAIL_COURSE_PATTERN.test(`${courseName} ${item.coursInfo || ''}`);
      const useOfficial = !isCurated && Boolean(officialLengthM)
        && (isTrailCourse || matchedRatio < MIN_MATCHED_STOP_RATIO || lengthOutOfRange);

      const totalDistance = useOfficial ? Math.round(officialLengthM) : route.distanceM;
      const estimatedDuration = useOfficial
        ? parseOfficialMinutes(item.reqreTime) || Math.max(1, Math.round(totalDistance / WALK_METERS_PER_MINUTE))
        : route.durationMin;

      const tmapLabel = `T맵 ${(route.distanceM / 1000).toFixed(2)}km·${route.durationMin}분`;
      const officialLabel = officialLengthM ? ` / 원본 ${(officialLengthM / 1000).toFixed(2)}km·${item.reqreTime || '-'}` : '';
      if (useOfficial) {
        stats.officialUsed += 1;
        const reason = isTrailCourse
          ? '코스명·경로에 산길 표현'
          : matchedRatio < MIN_MATCHED_STOP_RATIO
            ? `경유 지점 매칭 ${Math.round(matchedRatio * 100)}%`
            : `거리 비율 ${lengthRatio.toFixed(2)}`;
        console.log(`  - 🏔️  산길 코스로 판단(${reason}) → 원본 거리·시간 사용: ${tmapLabel}${officialLabel}`);
      } else {
        console.log(`  - 거리·시간(T맵): ${tmapLabel}${officialLabel}`);
      }

      if (maxMinutes > 0 && estimatedDuration > maxMinutes) {
        console.log(`❌ [스킵] 예상 소요시간 ${estimatedDuration}분 > ${maxMinutes}분`);
        stats.skipped += 1;
        continue;
      }

      const description = buildCourseDescription(item);

      if (isDryRun) {
        const spotCount = courseWaypointsList.filter((w) => w.spotId || w.name).length;
        console.log(`✅ [드라이런 완료] 거리: ${totalDistance}m, 소요: ${estimatedDuration}분, 경유지수: ${spotCount}`);
        stats.success += 1;
        continue;
      }

      // 코스 DB 저장 (UPSERT)
      const { rows: [course] } = await client.query(
        `INSERT INTO courses (
           owner_id, name, description, category, route_geometry,
           total_distance, estimated_duration, is_cycle,
           region, sub_region, is_public, data_source, source_id, status
         )
         VALUES (
           $1, $2, $3, '관광코스', $4::geography,
           $5, $6, $7,
           $8, $9, TRUE, $10, $11, 'active'
         )
         ON CONFLICT (data_source, source_id) WHERE source_id IS NOT NULL
         DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           route_geometry = EXCLUDED.route_geometry,
           total_distance = EXCLUDED.total_distance,
           estimated_duration = EXCLUDED.estimated_duration,
           is_cycle = EXCLUDED.is_cycle,
           region = EXCLUDED.region,
           sub_region = EXCLUDED.sub_region,
           status = 'active',
           updated_at = NOW()
         RETURNING course_id`,
        [
          ownerId,
          courseName,
          description,
          route.wkt,
          totalDistance,
          estimatedDuration,
          isCycle,
          region,
          sub_region,
          DATA_SOURCE,
          sourceId,
        ]
      );

      // 경유지(Waypoints) 및 스팟 연결 저장
      await insertCourseWaypoints(client, course.course_id, courseWaypointsList);

      // 코스 기본 태그: 추천코스 + 공식코스
      await client.query(
        `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
         SELECT unnest($1::uuid[]), $2, 'course', $3
         ON CONFLICT DO NOTHING`,
        [tagIds, course.course_id, ownerId]
      );

      // 산길 코스(봄내길·둘레길·자락길·숲길 등)는 '둘레길' 태그도 붙인다. (필터 #둘레길로 검색되도록)
      if (isTrailCourse) {
        await client.query(
          `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
           SELECT tag_id, $1, 'course', $2 FROM tags
           WHERE name = '둘레길' AND type = 'course' AND is_active = TRUE
           ON CONFLICT DO NOTHING`,
          [course.course_id, ownerId]
        );
      }

      // 코스 태그 최대 연결: 카테고리·설명·경유지 스팟 태그를 코스 태그로 승격
      try {
        const derivedTags = await courseTagService.autoTagCourse({
          courseId: course.course_id,
          courseName,           // ← 코스명 전달: '봄내길' 등 명칭 기반 태그 도출에 필요
          category: '관광코스',
          // 설명에서는 뺐지만 경유 경로의 장소명도 태그 도출에 쓴다.
          description: [description, item.coursInfo].filter(Boolean).join('\n\n'),
          userId: ownerId,
        }, client);
        if (derivedTags.length > 0) {
          console.log(`  🏷️  코스 자동 태그: ${derivedTags.join(', ')}`);
        }
      } catch (tagErr) {
        console.warn(`  ⚠️  코스 자동 태그 실패(무시): ${tagErr.message}`);
      }

      const registeredSpots = courseWaypointsList.filter((w) => w.spotId).length;
      console.log(`✅ [코스 적재 완료] ID: ${course.course_id} (연결된 스팟: ${registeredSpots}개)`);
      stats.success += 1;
    }
  } catch (err) {
    console.error('\n🚨 작업 중 오류 발생:', err);
    stats.failed += 1;
  } finally {
    if (client) client.release();
    if (!isDryRun) await pool.end();
  }

  console.log('\n=============================================');
  console.log(`📊 코스 및 스팟 적재 최종 결과:`);
  console.log(`- 대상 코스 수: ${stats.total}`);
  console.log(`- 성공 코스 수: ${stats.success}`);
  console.log(`- 신규 등록 스팟: ${stats.spotsSaved}개`);
  console.log(`- TourAPI 관광정보 매칭: ${stats.tourEnriched}개`);
  console.log(`- 찾지 못한 경유 지점: ${stats.unmatchedStops}개`);
  console.log(`- 산길 코스로 원본 거리·시간 사용: ${stats.officialUsed}개`);
  console.log(`- 스킵 코스 수: ${stats.skipped}`);
  console.log(`- 실패 코스 수: ${stats.failed}`);
  console.log('=============================================\n');
}

main().catch((err) => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
