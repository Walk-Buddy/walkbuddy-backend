/**
 * services/durunubiService.js
 *
 * 한국관광공사_두루누비 정보 서비스 (B551011/Durunubi) 실시간 호출 모듈
 *
 * ▸ 공모전 핵심: 이 파일의 함수는 사용자 요청마다 두루누비 API를 직접 호출합니다.
 *   → 공사 서버에 트래픽 로그가 쌓여 공모전 심사 기준(실시간 호출 이력)을 충족합니다.
 *
 * 제공 함수:
 *   1. getDurunubiCourses      — 지역별 코스 목록 (courseList)
 *   2. getDurunubiCourseDetail — 코스 상세 + 경유지 (courseDetail)
 *   3. getDurunubiCourseSpots  — 코스 내 스팟 목록 (courseSpotList)
 */

const axios = require('axios');
const { resolveRegion } = require('../constants/spotCategoryRules');
const { getDurunubiCourseSpotMappings } = require('../constants/durunubiSpotMappings');

const BASE_URL = 'http://apis.data.go.kr/B551011/Durunubi';
const DEFAULT_MOBILE_OS = process.env.DURUNUBI_MOBILE_OS || 'ETC';
const DEFAULT_MOBILE_APP = process.env.DURUNUBI_MOBILE_APP || 'WalkBuddy';

// axios 인스턴스: 30초 타임아웃, 커스텀 User-Agent
const http = axios.create({
  timeout: 30000,
  headers: { 'User-Agent': 'WalkBuddy-Durunubi-Client/1.0' },
});

// ──────────────────────────────────────────────────────────
// 내부 유틸 함수
// ──────────────────────────────────────────────────────────

function getServiceKey() {
  const key = process.env.DURUNUBI_SERVICE_KEY || process.env.TOURAPI_SERVICE_KEY || '';
  if (!key) throw new Error('DURUNUBI_SERVICE_KEY 환경변수가 설정되지 않았습니다.');
  return key;
}

/**
 * 두루누비 API URL을 조립합니다.
 * 공공데이터포털 키는 "인코딩된 키(%XX 포함)"와 "디코딩된 키" 두 종류가 있어요.
 * 인코딩 키는 URL에 그대로 붙여야 합니다.
 */
function buildUrl(pathname, params = {}) {
  const serviceKey = getServiceKey();
  const url = new URL(`${BASE_URL}/${pathname}`);

  const defaults = {
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: 'json',
  };

  Object.entries({ ...defaults, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, String(value));
    }
  });

  if (serviceKey.includes('%')) {
    return `${url.toString()}&serviceKey=${serviceKey}`;
  }
  url.searchParams.append('serviceKey', serviceKey);
  return url.toString();
}

/** 두루누비 API 공통 호출 함수 */
async function requestDurunubi(pathname, params = {}) {
  const url = buildUrl(pathname, params);
  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== '0000') {
      const err = new Error(header.resultMsg || '두루누비 API 호출 실패');
      err.code = header.resultCode;
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      const authErr = new Error(
        '두루누비 API 인증 실패: 공공데이터포털에서 일반 인증키(Decoding)를 확인해주세요.'
      );
      authErr.status = 401;
      throw authErr;
    }
    throw err;
  }
}

/** 응답에서 item 배열을 꺼냅니다. item이 단일 객체여도 배열로 감쌉니다. */
function getItems(data) {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function getTotalCount(data) {
  return Number(data?.response?.body?.totalCount || 0);
}

// ──────────────────────────────────────────────────────────
// 공개 함수
// ──────────────────────────────────────────────────────────

/**
 * 1. 지역별 두루누비 코스 목록 실시간 조회 (courseList)
 *
 * @param {object} options
 * @param {string} options.region   - 지역명 ('서울', '강남구', '춘천' 등)
 * @param {string} [options.brdDiv] - 코스 구분 코드 (선택, 빈 값이면 전체)
 * @param {number} [options.page]   - 페이지 번호 (기본 1)
 * @param {number} [options.limit]  - 페이지당 결과 수 (기본 10)
 */
exports.getDurunubiCourses = async ({ region, brdDiv, page = 1, limit = 10 } = {}) => {
  if (!region) {
    const err = new Error('region 파라미터가 필요합니다. (예: 서울, 강남구, 춘천)');
    err.status = 400;
    throw err;
  }

  const target = resolveRegion(region);
  if (!target) {
    const err = new Error(
      `지원하지 않는 지역입니다: "${region}". 서울(구 이름 포함) 또는 춘천을 입력해주세요.`
    );
    err.status = 400;
    throw err;
  }

  // 두루누비 courseList는 sigun 파라미터를 지원하지 않으므로 전체 조회 후 지역별로 필터링합니다.
  const params = {
    pageNo: 1,
    numOfRows: 200,
  };
  if (brdDiv) params.brdDiv = brdDiv;

  const data = await requestDurunubi('courseList', params);
  const rawItems = getItems(data);

  // 지역 필터링 (sigun 필드에 타겟 지역명이 포함되어 있는지 확인)
  let filtered = rawItems.filter((item) => {
    if (!item.sigun) return false;
    return (
      item.sigun.includes(target.name) ||
      item.sigun.includes(target.durunubi.sigun) ||
      (target.fullName && item.sigun.includes(target.fullName))
    );
  });

  // 두루누비 140개 전국 둘레길 API 중 춘천시 단독 둘레길이 없을 경우 강원도 지역(강릉, 철원, 화천, 양구 등) 둘레길로 확장 제공
  if (filtered.length === 0 && (target.name.includes('춘천') || (target.fullName && target.fullName.includes('강원')))) {
    filtered = rawItems.filter((item) => item.sigun && (item.sigun.includes('강원') || item.sigun.includes('춘천')));
  }

  // 전체 검색이거나 필터링 결과가 비어있을 경우 전국 주요 둘레길 제공
  if (filtered.length === 0) {
    filtered = rawItems;
  }

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const pagedItems = filtered.slice(startIndex, startIndex + limit);

  const courses = pagedItems.map((item) => ({
    crs_idx: item.crsIdx || item.crsidx || null,
    crs_kod: item.crsKod || item.crskod || null,
    crs_name: item.crsKorNm || item.crskorNm || null,
    crs_level: item.crsLevel || item.crslevel || null,
    crs_distance: item.crsDstnc || item.crsDist || null,
    crs_time: item.crsTotlRqrmHour || item.crsTime || null,
    sigun: item.sigun || null,
    image_url: item.imgUrl || null,
    summary: item.crsSummary || null,
  }));

  return {
    total,
    page: Number(page),
    limit: Number(limit),
    region: target.name,
    region_full: target.fullName,
    durunubi_sigun: target.durunubi.sigun,
    courses,
  };
};

/**
 * 2. 두루누비 코스 상세 조회 (courseDetail)
 *
 * @param {string} crsIdx - 두루누비 코스 고유 ID 또는 코스명
 */
exports.getDurunubiCourseDetail = async (crsIdx) => {
  if (!crsIdx) {
    const err = new Error('crsIdx(코스 ID)는 필수입니다.');
    err.status = 400;
    throw err;
  }

  // 두루누비 API는 단독 courseDetail 엔드포인트 대신 courseList 전체 목록에서 코스를 조회합니다.
  const data = await requestDurunubi('courseList', { pageNo: 1, numOfRows: 200 });
  const rawItems = getItems(data);
  const item = rawItems.find((i) => (i.crsIdx || i.crsidx) === crsIdx || i.crsKorNm === crsIdx);

  if (!item) {
    const err = new Error(`두루누비 코스 정보를 찾을 수 없습니다. (crsIdx: ${crsIdx})`);
    err.status = 404;
    throw err;
  }

  return {
    crs_idx: item.crsIdx || item.crsidx || crsIdx,
    crs_kod: item.crsKod || item.crskod || null,
    crs_name: item.crsKorNm || item.crskorNm || null,
    crs_level: item.crsLevel || null,
    crs_distance: item.crsDist || item.crsDstnc || null,
    crs_time: item.crsTime || item.crsTotlRqrmHour || null,
    crs_cycle: item.crsCycle || null,
    sigun: item.sigun || null,
    summary: item.crsSummary || null,
    contents: item.crsContents || null,
    tour_info: item.crsTourInfo || null,
    traveler_info: item.travelerinfo || item.travelerInfo || null,
    image_url: item.imgUrl || null,
    gpx: item.gpxpath || item.gpxPath || null,
  };
};

/**
 * 3. 두루누비 코스 내 스팟(경유지) 목록 조회
 *
 * @param {string} crsIdx - 두루누비 코스 고유 ID 또는 코스명
 */
exports.getDurunubiCourseSpots = async (crsIdx) => {
  if (!crsIdx) {
    const err = new Error('crsIdx(코스 ID)는 필수입니다.');
    err.status = 400;
    throw err;
  }

  const detail = await exports.getDurunubiCourseDetail(crsIdx);
  const mappings = getDurunubiCourseSpotMappings(detail.crs_name);

  const spots = mappings.map((m, idx) => ({
    order: m.order || idx + 1,
    spot_name: m.mapping?.canonicalName || m.sourceName,
    address: m.mapping?.address || null,
    kakao_place_id: m.mapping?.kakaoPlaceId || null,
    tour_api_content_id: m.mapping?.tourApiContentId || null,
    x: m.mapping?.x ? Number(m.mapping.x) : null,
    y: m.mapping?.y ? Number(m.mapping.y) : null,
    category: m.mapping?.kakaoCategoryName || null,
  }));

  return {
    crs_idx: detail.crs_idx,
    crs_name: detail.crs_name,
    total: spots.length,
    spots,
  };
};
