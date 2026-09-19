/**
 * services/tourTrafficLog.js
 *
 * 공공데이터포털(TourAPI · 무장애 · 반려동물 · 관광사진 · 두루누비) OpenAPI를
 * "언제 · 어떤 오퍼레이션을 · 몇 ms 만에 · 어떤 결과로" 호출했는지 남기는
 * 인메모리 실시간 트래픽 로거.
 *
 * ▸ 공모전 활용: 앱이 실제로 공사 서버를 실시간 호출하고 있음을
 *   서버에서 즉시(SSE 스트림 포함) 확인할 수 있게 한다.
 * ▸ serviceKey 는 로그에 남기지 않는다(유출 방지).
 * ▸ 프로세스 재시작 시 버퍼는 초기화된다(영속 로그가 필요하면 별도 적재).
 */

'use strict';

const { EventEmitter } = require('events');

// 링 버퍼 크기 (최근 N건만 보관)
const MAX_ENTRIES = Math.max(Number(process.env.TOUR_TRAFFIC_LOG_MAX) || 1000, 50);

const entries = [];
const counters = {
  total: 0,
  ok: 0,
  error: 0,
  byApi: {},   // { KorService2: 12, Durunubi: 3, ... }
  byPath: {},  // { 'KorService2/searchFestival2': 5, ... }
};

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // SSE 구독자 수 제한 없음

const PROCESS_STARTED_AT = new Date().toISOString();

/** serviceKey 등 민감 파라미터를 제거한 사본 */
function sanitizeParams(params = {}) {
  const clone = { ...params };
  delete clone.serviceKey;
  delete clone.ServiceKey;
  delete clone.SERVICE_KEY;
  return clone;
}

/**
 * OpenAPI 호출 1건을 기록한다.
 * @param {object} e
 * @param {string} e.api        - 서비스 구분 (KorService2, KorWithService2, KorPetTourService2, PhotoGalleryService1, Durunubi)
 * @param {string} e.pathname   - 오퍼레이션 (searchFestival2, areaBasedList2, courseList ...)
 * @param {object} [e.params]   - 요청 파라미터(serviceKey 제외)
 * @param {'ok'|'error'} e.status
 * @param {number} [e.httpStatus]
 * @param {string} [e.resultCode]
 * @param {string} [e.message]
 * @param {number} [e.durationMs]
 * @param {number} [e.startedAt] - Date.now() 기준 시작 시각
 * @param {string} [e.actor]     - 요청 주체(예: user id, 'system')
 */
function record(e) {
  const startedAt = e.startedAt || Date.now();
  const entry = {
    id: entries.length ? entries[entries.length - 1].id + 1 : 1,
    at: new Date(startedAt).toISOString(),
    api: e.api || 'unknown',
    pathname: e.pathname || 'unknown',
    params: sanitizeParams(e.params),
    status: e.status === 'ok' ? 'ok' : 'error',
    httpStatus: e.httpStatus ?? null,
    resultCode: e.resultCode ?? null,
    message: e.message ?? null,
    durationMs: e.durationMs ?? (Date.now() - startedAt),
    actor: e.actor ?? null,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  counters.total += 1;
  if (entry.status === 'ok') counters.ok += 1;
  else counters.error += 1;

  const apiKey = entry.api;
  counters.byApi[apiKey] = (counters.byApi[apiKey] || 0) + 1;
  const pathKey = `${entry.api}/${entry.pathname}`;
  counters.byPath[pathKey] = (counters.byPath[pathKey] || 0) + 1;

  // 실시간 콘솔 라인 (심사·디버깅용)
  const mark = entry.status === 'ok' ? 'OK ' : 'ERR';
  const extra = [
    `${entry.durationMs}ms`,
    entry.resultCode ? `code=${entry.resultCode}` : null,
    entry.message ? `msg=${entry.message}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  console.log(`[OPENAPI ${mark}] ${entry.api}/${entry.pathname} ${extra}`);

  // SSE 구독자에게 즉시 전파
  emitter.emit('entry', entry);
  return entry;
}

/**
 * 최근 로그를 최신순으로 반환한다.
 * @param {{limit?:number, api?:string, pathname?:string, status?:string}} [opts]
 */
function list(opts = {}) {
  const { limit = 100, api, pathname, status } = opts;
  let arr = entries;
  if (api) arr = arr.filter((x) => x.api === api);
  if (pathname) arr = arr.filter((x) => x.pathname === pathname);
  if (status) arr = arr.filter((x) => x.status === status);

  const n = Math.min(Math.max(Number(limit) || 100, 1), MAX_ENTRIES);
  return arr.slice(-n).reverse();
}

/** 누적 통계 */
function stats() {
  const last = entries[entries.length - 1];
  return {
    process_started_at: PROCESS_STARTED_AT,
    uptime_sec: Math.round(process.uptime()),
    buffered: entries.length,
    max_buffer: MAX_ENTRIES,
    last_call_at: last ? last.at : null,
    last_call_api: last ? `${last.api}/${last.pathname}` : null,
    counters: {
      total: counters.total,
      ok: counters.ok,
      error: counters.error,
      byApi: { ...counters.byApi },
      byPath: { ...counters.byPath },
    },
  };
}

/** 버퍼 비우기(통계 카운터는 유지) */
function clear() {
  entries.length = 0;
}

/** SSE 구독 헬퍼 */
function subscribe(listener) {
  emitter.on('entry', listener);
  return () => emitter.off('entry', listener);
}

module.exports = {
  record,
  list,
  stats,
  clear,
  subscribe,
  MAX_ENTRIES,
};
