const axios = require('axios');
const trafficLog = require('./tourTrafficLog');

const BASE_URL = 'https://apis.data.go.kr/B551011/Odii';
const DEFAULT_MOBILE_OS = 'ETC';
const DEFAULT_MOBILE_APP = 'WalkBuddy';
const DEFAULT_LANG_CODE = 'ko'; // Odii 필수 파라미터 (누락 시 resultCode 11)

// ODII_API_KEY 또는 기타 공공데이터 키 fallback
function getServiceKey() {
  return (
    process.env.ODII_API_KEY ||
    process.env.TOURAPI_SERVICE_KEY ||
    process.env.TOUR_API_KEY ||
    ''
  );
}

const http = axios.create({
  timeout: 5000, // 5초 타임아웃 (빠른 Fallback 전환을 위해)
  headers: {
    'User-Agent': 'WalkBuddy-Odii-Client/1.0',
  },
});

function buildUrl(pathname, params = {}) {
  const serviceKey = getServiceKey();
  if (!serviceKey) {
    return null;
  }

  const url = new URL(`${BASE_URL}/${pathname}`);
    const defaultParams = {
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: 'json',
    langCode: DEFAULT_LANG_CODE,
  };

  Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
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

async function requestOdiiApi(pathname, params = {}) {
  const url = buildUrl(pathname, params);
  if (!url) {
    return null;
  }

  const api = 'Odii';
  const startedAt = Date.now();

  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== '0000') {
      trafficLog.record({
        api,
        pathname,
        params,
        status: 'error',
        httpStatus: 200,
        resultCode: header.resultCode,
        message: header.resultMsg || 'Odii API 오류',
        durationMs: Date.now() - startedAt,
        startedAt,
      });
      return null;
    }

    // 실시간 OpenAPI 트래픽 로그 기록 (공사 서버 호출 증빙)
    trafficLog.record({
      api,
      pathname,
      params,
      status: 'ok',
      httpStatus: 200,
      resultCode: header?.resultCode || '0000',
      durationMs: Date.now() - startedAt,
      startedAt,
    });
    return data;
  } catch (err) {
    // Odii API 장애나 타임아웃 시 AI Fallback으로 넘어가도록 null 반환
    trafficLog.record({
      api,
      pathname,
      params,
      status: 'error',
      httpStatus: err.response?.status ?? null,
      message: err.message,
      durationMs: Date.now() - startedAt,
      startedAt,
    });
    return null;
  }
}

function getItems(data) {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/**
 * Odii 응답 아이템에서 오디오 URL 및 대본 추출
 */
function parseOdiiItem(item) {
  if (!item) return null;

  const audioUrl = item.audioUrl || item.audiourl || item.audio_url || item.fileUrl || item.fileurl || null;
  const script = item.script || item.storyScript || item.summary || item.overview || item.title || item.storyTitle || '';
  const title = item.title || item.storyTitle || item.themeTitle || '';

  if (!audioUrl) return null;

  return {
    title,
    script,
    audio_url: audioUrl,
    source: 'odii',
  };
}

/**
 * 1. 위치 기반 오디오 가이드 검색 (storyLocationBasedList)
 * @param {Object} params { mapX, mapY, radius }
 */
async function searchByLocation({ mapX, mapY, radius = 500, numOfRows = 5 }) {
  if (!mapX || !mapY) return [];

  const data = await requestOdiiApi('storyLocationBasedList', {
    mapX,
    mapY,
    radius,
    numOfRows,
    pageNo: 1,
  });

  const items = getItems(data);
  return items.map(parseOdiiItem).filter(Boolean);
}

/**
 * 2. 키워드 기반 오디오 가이드 검색 (storySearchList)
 * @param {string} keyword
 */
async function searchByKeyword(keyword, numOfRows = 5) {
  if (!keyword || !keyword.trim()) return [];

  const data = await requestOdiiApi('storySearchList', {
    keyword: keyword.trim(),
    numOfRows,
    pageNo: 1,
  });

  const items = getItems(data);
  return items.map(parseOdiiItem).filter(Boolean);
}

/**
 * 스팟 이름과 Odii 스토리 제목의 유사도 판정.
 * 정규화(공백·특수문자 제거) 후 다음 중 하나면 "같은 장소"로 본다.
 *   - 한쪽이 다른 쪽을 포함
 *   - 핵심어(2글자 이상)가 겹침
 * Odii 위치검색은 반경 내 여러 장소를 주므로, 이 검증 없이 첫 결과를 쓰면
 * 엉뚱한 음성(경교장 자리에 이화장, 서울적십자병원 자리에 새문안로)이 매칭된다.
 */
function normalizeForMatch(s) {
  return String(s || '')
    .replace(/\(.*?\)/g, '')        // 괄호 부가설명 제거
    .replace(/[\s\-_·.,]/g, '')      // 공백/구두점 제거
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase();
}

function isSamePlace(spotName, storyTitle) {
  const a = normalizeForMatch(spotName);
  const b = normalizeForMatch(storyTitle);
  if (!a || !b) return false;

  // 한쪽이 다른 쪽을 포함 (예: "경교장" ⊂ "경교장", "서울적십자병원" ⊂ "서울적십자병원")
  if (a.includes(b) || b.includes(a)) return true;

  // 공통 부분이 2글자 이상 연속으로 겹치면 동일 장소로 인정
  // (예: "뚝섬한강공원"vs"뚝섬", "경복궁"vs"경복궁야간개장")
  for (let len = Math.min(a.length, b.length); len >= 2; len--) {
    for (let i = 0; i + len <= a.length; i++) {
      const sub = a.slice(i, i + len);
      if (b.includes(sub)) return true;
    }
  }
  return false;
}

/**
 * 3. 스팟 정보({ name, x, y })로 최적의 Odii 오디오 가이드 단건 조회
 *
 * 우선순위(이름 정확도 검증 필수):
 *   1) 이름 키워드 검색 → 이름이 일치하는 결과만 채택
 *   2) 위치 기반 검색(반경 300m) → 이름이 일치하는 결과만 채택
 *   3) 끝까지 이름이 일치하는 게 없으면 null (→ 호출부가 AI TTS로 폴백)
 * 엉뚱한 장소의 음성을 들려주는 것보다 AI TTS 폴백이 낫다.
 */
async function findBestOdiiGuide({ name, x, y }) {
  try {
    const candidates = [];

    // 1단계: 스팟 이름 키워드 검색 (가장 정확)
    if (name) {
      const keyword = name.split(' ')[0].trim();
      const keywordResults = await searchByKeyword(keyword, 10);
      for (const item of keywordResults) {
        if (isSamePlace(name, item.title) || isSamePlace(name, item.script)) {
          candidates.push(item);
        }
      }
    }

    // 2단계: 위치 기반 검색 (반경 300m) — 이름 일치하는 것만
    if (x && y) {
      const locationResults = await searchByLocation({ mapX: x, mapY: y, radius: 300, numOfRows: 10 });
      for (const item of locationResults) {
        if (isSamePlace(name, item.title) || isSamePlace(name, item.script)) {
          candidates.push(item);
        }
      }
    }

    if (candidates.length === 0) {
      return null; // 이름이 맞는 Odii 가이드가 없음 → AI TTS 폴백
    }

    // 중복 제거(오디오 URL 기준) 후 첫 후보 반환
    const seen = new Set();
    const unique = candidates.filter((c) => {
      if (seen.has(c.audio_url)) return false;
      seen.add(c.audio_url);
      return true;
    });
    return unique[0];
  } catch (err) {
    return null;
  }
}

module.exports = {
  searchByLocation,
  searchByKeyword,
  findBestOdiiGuide,
};
