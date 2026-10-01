/**
 * utils/kakaoPlaceMatch.js
 *
 * "장소 하나는 카카오 장소 ID 하나" 원칙을 위한 공용 매칭 도구.
 * TourAPI·레거시 스팟(tour_*, tour:*, tour_with_*)을 같은 위치의 카카오 장소로 연결할 때 쓴다.
 */

const axios = require('axios');

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

// 레거시 스팟 ID: tour_123, tour_with_123, tour:123
const LEGACY_PLACE_ID_PATTERN = /^tour(?:_with)?[_:](\d+)$/;

// 장소 자체가 아닌 부속시설·상업시설로 잘못 매칭되는 카카오 카테고리 (예: 구봉산 → 구봉산카페쉼터)
const EXCLUDED_KAKAO_CATEGORY_PATTERN = /편의점|주차장|화장실|충전소|숙박|매표소|퀵서비스|식품판매|입출구|^부동산 > (?!빌딩)|^음식점|^의료,건강/;

// 원래 이름 뒤에 붙으면 부속시설인 단어 (예: 석촌동고분군 관리사무소, 독산근린공원 운동장1)
const FACILITY_SUFFIX_PATTERN = /(관리사무소|사무소|관리소|운동장|체육시설|주차장|화장실|매표소|매점|출입구|입구|정류장|안내소|안내센터|휴게소|게이트|점)\d*$/;

function normalizePlaceName(name = '') {
  return String(name)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[\s·ㆍ.,'"`\-]/g, '')
    .toLowerCase();
}

function legacyContentId(placeId) {
  const match = String(placeId || '').match(LEGACY_PLACE_ID_PATTERN);
  return match ? match[1] : null;
}

function isLegacyPlaceId(placeId) {
  return placeId == null || LEGACY_PLACE_ID_PATTERN.test(String(placeId));
}

/**
 * 두 이름이 같은 장소인지. 한쪽이 다른 쪽을 포함하면 같은 장소로 보되,
 * 덧붙은 부분이 부속시설 이름이거나 숫자뿐이면 다른 장소로 본다.
 * ("서울 경교장" = "경교장", "탑골공원 팔각정" = "탑골공원", "독산근린공원 운동장1" ≠ "독산 근린공원")
 */
function isSamePlaceName(a, b) {
  const x = normalizePlaceName(a);
  const y = normalizePlaceName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length < 3 || !longer.includes(shorter)) return false;
  const extra = longer.replace(shorter, '');
  return !(FACILITY_SUFFIX_PATTERN.test(extra) || /^\d+$/.test(extra));
}

// 댐·호수·산처럼 넓은 장소는 좌표가 멀 수 있어, 이름이 정확히 같은 곳만 이 반경까지 찾는다.
const EXACT_MATCH_RADIUS_M = 2000;

async function searchKakao(query, x, y, radius, kakaoKey) {
  const { data } = await axios.get(KAKAO_KEYWORD_URL, {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
    params: { query, x, y, radius, sort: 'distance', size: 15 },
    timeout: 5000,
  }).catch(() => ({ data: null }));
  return (data?.documents || []).filter((doc) => !EXCLUDED_KAKAO_CATEGORY_PATTERN.test(String(doc.category_name || '')));
}

/**
 * 좌표 주변에서 이름이 같은 카카오 장소를 찾는다. 없으면 null.
 *  1) radius 안에서 이름이 정확히 같은 곳
 *  2) 없으면 2km 안에서 이름이 정확히 같은 곳 (예: 구봉산 → "구봉산전망대카페거리" 대신 "구봉산")
 *  3) 없으면 radius 안에서 이름이 포함 관계인 가장 가까운 곳
 */
async function findKakaoPlaceNear({ name, x, y, radius = 300, kakaoKey = process.env.KAKAO_REST_API_KEY }) {
  if (!kakaoKey || !name || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;

  const query = String(name).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const isExact = (doc) => normalizePlaceName(doc.place_name) === normalizePlaceName(name);

  const nearby = await searchKakao(query, x, y, radius, kakaoKey);
  const exactNearby = nearby.find(isExact);
  if (exactNearby) return exactNearby;

  const exactWide = (await searchKakao(query, x, y, Math.max(radius, EXACT_MATCH_RADIUS_M), kakaoKey)).find(isExact);
  if (exactWide) return exactWide;

  return nearby.find((doc) => isSamePlaceName(name, doc.place_name)) || null;
}

module.exports = {
  LEGACY_PLACE_ID_PATTERN,
  EXCLUDED_KAKAO_CATEGORY_PATTERN,
  normalizePlaceName,
  legacyContentId,
  isLegacyPlaceId,
  isSamePlaceName,
  findKakaoPlaceNear,
};
