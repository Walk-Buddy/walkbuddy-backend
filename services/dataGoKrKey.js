/**
 * services/dataGoKrKey.js
 *
 * 공공데이터포털(apis.data.go.kr) 인증키 일일 한도 초과 대응.
 *
 * 공공데이터포털의 일일 트래픽은 "인증키 × 오퍼레이션" 단위로 집계된다.
 * (예: detailCommon2 만 한도를 넘고 detailIntro2 는 정상일 수 있음)
 *
 * axios 인스턴스에 인터셉터를 달아서
 *  1) 응답이 일일 한도 초과(returnReasonCode 22)이면 그 오퍼레이션만 보조 키
 *     (TOURAPI_SERVICE_KEY_FALLBACK, 쉼표로 여러 개 가능)로 바꿔 한 번 재시도하고,
 *  2) 이후 EXHAUSTED_COOLDOWN_MS 동안은 같은 오퍼레이션에 처음부터 보조 키를 쓴다.
 *  3) 쓸 수 있는 키가 모두 소진됐으면 네트워크 요청 없이 즉시 실패시켜
 *     한도 초과 상태에서 같은 호출을 계속 반복하지 않게 한다.
 *
 * 키를 읽는 위치(tourApiService, spotService, odiiService, 스크립트)가 여러 곳이라
 * 각 위치를 고치지 않고 요청 단계에서 serviceKey 를 바꿔 끼운다.
 */

'use strict';

const axios = require('axios');

const HOST = 'apis.data.go.kr';
const EXHAUSTED_COOLDOWN_MS = 30 * 60 * 1000;
const QUOTA_ERROR_PATTERN = /LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS/;
// 그 서비스(예: KorWithService2)에 활용신청이 안 된 키. 이 오퍼레이션에는 다음 키를 쓴다.
const NOT_REGISTERED_PATTERN = /SERVICE_KEY_IS_NOT_REGISTERED/;

// `${key}|${operation}` -> 다시 시도해 볼 시각(ms)
const exhaustedUntil = new Map();
let quotaErrorCount = 0;

function getPrimaryKey() {
  return (
    process.env.TOURAPI_SERVICE_KEY ||
    process.env.TOUR_API_SERVICE_KEY ||
    process.env.TOUR_API_KEY ||
    process.env.DURUNUBI_SERVICE_KEY ||
    ''
  );
}

function getKeyChain() {
  const fallbacks = String(process.env.TOURAPI_SERVICE_KEY_FALLBACK || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  // IMPORTANT: 공공데이터포털 '인코딩' 키(%2B 등 포함)를 넣으면 요청 때 한 번 더 인코딩돼
  // "등록되지 않은 서비스키"가 된다. 항상 디코딩 키로 바꿔 쓴다.
  return [...new Set([getPrimaryKey(), ...fallbacks].filter(Boolean).map((key) => decodeSafe(key)))];
}

function getRequestUrl(config) {
  try {
    return new URL(config.url, config.baseURL);
  } catch {
    return null;
  }
}

// "/B551011/KorService2/detailCommon2" -> "KorService2/detailCommon2"
function getOperation(url) {
  return url.pathname.split('/').filter(Boolean).slice(-2).join('/');
}

// URL 문자열 또는 params 에 들어 있는 serviceKey 를 찾는다. (인코딩 여부 무관)
function findUsedKey(config, keys) {
  const paramKey = config.params?.serviceKey;
  if (paramKey) return keys.find((key) => key === paramKey || decodeSafe(key) === decodeSafe(paramKey)) || null;

  const rawUrl = String(config.url || '');
  return keys.find((key) => rawUrl.includes(key) || rawUrl.includes(encodeURIComponent(key))) || null;
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function replaceKey(config, fromKey, toKey) {
  if (config.params?.serviceKey) {
    config.params = { ...config.params, serviceKey: toKey };
    return;
  }
  const rawUrl = String(config.url || '');
  if (rawUrl.includes(fromKey)) {
    config.url = rawUrl.split(fromKey).join(toKey.includes('%') ? toKey : encodeURIComponent(toKey));
  } else {
    config.url = rawUrl.split(encodeURIComponent(fromKey)).join(encodeURIComponent(toKey));
  }
}

function isExhausted(key, operation) {
  const until = exhaustedUntil.get(`${key}|${operation}`);
  if (!until) return false;
  if (Date.now() >= until) {
    exhaustedUntil.delete(`${key}|${operation}`);
    return false;
  }
  return true;
}

function markExhausted(key, operation) {
  exhaustedUntil.set(`${key}|${operation}`, Date.now() + EXHAUSTED_COOLDOWN_MS);
}

function isQuotaExceededResponse(response) {
  if (!response) return false;
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
  return QUOTA_ERROR_PATTERN.test(body) || NOT_REGISTERED_PATTERN.test(body);
}

function createQuotaError(config, operation) {
  const err = new Error(`공공데이터포털 일일 한도 초과: ${operation} (사용 가능한 인증키 없음)`);
  err.code = 'DATA_GO_KR_QUOTA_EXCEEDED';
  err.status = 429;
  err.config = config;
  err.response = { status: 429, data: { quotaExceeded: true, operation }, headers: {}, config };
  return err;
}

// 소진된 키로는 아예 보내지 않고, 남은 키로 바꾼다. 남은 키가 없으면 즉시 실패.
function onRequest(config) {
  const url = getRequestUrl(config);
  if (!url || url.hostname !== HOST) return config;

  const keys = getKeyChain();
  const usedKey = findUsedKey(config, keys);
  if (!usedKey) return config;

  const operation = getOperation(url);
  if (!isExhausted(usedKey, operation)) return config;

  const nextKey = keys.find((key) => !isExhausted(key, operation));
  if (!nextKey) {
    quotaErrorCount += 1;
    throw createQuotaError(config, operation);
  }
  replaceKey(config, usedKey, nextKey);
  return config;
}

async function retryWithNextKey(instance, config, response) {
  const url = getRequestUrl(config);
  if (!url || url.hostname !== HOST || !isQuotaExceededResponse(response)) return null;

  const keys = getKeyChain();
  const usedKey = findUsedKey(config, keys);
  const operation = getOperation(url);
  if (usedKey) markExhausted(usedKey, operation);

  // 키가 여러 개면 쓸 수 있는 키를 차례로 모두 시도한다 (예전엔 한 번만 재시도해서 세 번째 키를 쓰지 못했다)
  const tried = [...(config.__dataGoKrTried || []), usedKey].filter(Boolean);
  const nextKey = keys.find((key) => !isExhausted(key, operation) && !tried.includes(key));
  if (!usedKey || !nextKey) {
    // 보조 키로도 처리하지 못한 경우만 실패로 센다. (재시도가 성공하면 데이터는 온전함)
    quotaErrorCount += 1;
    return undefined;
  }

  const reason = NOT_REGISTERED_PATTERN.test(typeof response.data === 'string' ? response.data : JSON.stringify(response.data || ''))
    ? '활용신청 안 된 키' : '일일 한도 초과';
  console.warn(`[data.go.kr] ${operation} ${reason} → 다음 인증키로 재시도`);
  const retryConfig = { ...config, __dataGoKrTried: tried };
  replaceKey(retryConfig, usedKey, nextKey);
  return instance.request(retryConfig);
}

function installDataGoKrKeyFallback(instance = axios) {
  if (instance.__dataGoKrKeyFallbackInstalled) return instance;
  instance.__dataGoKrKeyFallbackInstalled = true;

  instance.interceptors.request.use(onRequest);
  instance.interceptors.response.use(
    async (response) => {
      // 일부 오퍼레이션은 HTTP 200 + 에러 본문으로 응답한다.
      const retried = await retryWithNextKey(instance, response.config, response);
      return retried || response;
    },
    async (err) => {
      if (!err.config || !err.response) throw err;
      const retried = await retryWithNextKey(instance, err.config, err.response);
      if (retried) return retried;
      throw err;
    }
  );
  return instance;
}

// 보강 작업이 한도 초과로 불완전하게 끝났는지 판단할 때 사용 (전후 값 비교)
function getQuotaErrorCount() {
  return quotaErrorCount;
}

// 기본 axios 인스턴스(axios.get 직접 호출하는 코드)에 자동 적용
installDataGoKrKeyFallback(axios);

module.exports = {
  installDataGoKrKeyFallback,
  getQuotaErrorCount,
};
