const axios = require('axios');

const BASE_URL = 'https://apis.data.go.kr/B551011/Odii';
const DEFAULT_MOBILE_OS = 'ETC';
const DEFAULT_MOBILE_APP = 'WalkBuddy';

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

  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== '0000') {
      return null;
    }
    return data;
  } catch (err) {
    // Odii API 장애나 타임아웃 시 AI Fallback으로 넘어가도록 null 반환
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
 * 3. 스팟 정보({ name, x, y })로 최적의 Odii 오디오 가이드 단건 조회
 */
async function findBestOdiiGuide({ name, x, y }) {
  try {
    // 1단계: 위치 기반 검색 (스팟 반경 300m 이내)
    if (x && y) {
      const locationResults = await searchByLocation({ mapX: x, mapY: y, radius: 300 });
      if (locationResults.length > 0) {
        return locationResults[0];
      }
    }

    // 2단계: 스팟 이름 키워드 검색
    if (name) {
      // 불필요한 수식어 제거 후 핵심 단어로 검색 시도 (예: "뚝섬한강공원" -> "뚝섬")
      const keyword = name.split(' ')[0].trim();
      const keywordResults = await searchByKeyword(keyword);
      if (keywordResults.length > 0) {
        return keywordResults[0];
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  searchByLocation,
  searchByKeyword,
  findBestOdiiGuide,
};
