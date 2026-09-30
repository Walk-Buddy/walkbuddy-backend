#!/usr/bin/env node
/**
 * scripts/verify-audio.js
 * ─────────────────────────────────────────────────────────────
 * 음성 안내(TTS 도슨트) 파이프라인을 "한 번에" 검증한다.
 *
 *   [다가감 ≤100m] → ai-contents API → (Odii or Gemini 대본)
 *     → Google Neural2 TTS(mp3) → S3 업로드 → DB 캐시 → 단말 재생
 *
 * 검증 단계:
 *   STEP 0. 환경/DB 연결 확인
 *   STEP 1. 외부 키(Gemini / TTS / S3 / Odii) 살아있는지
 *   STEP 2. 검증 대상 스팟 자동 선택 (캐시된 것 우선, 없으면 active 스팟)
 *   STEP 3. 스크립트(대본) 존재/품질 검증  ── DB spot_ai_contents.script
 *   STEP 4. mp3(+S3) 검증                  ── DB audio_url + HTTP HEAD
 *   STEP 5. ai-contents API 통합 검증      ── GET /api/spots/:id/ai-contents
 *   STEP 6. 근접 트리거 로직 시뮬레이션    ── 100m Haversine (프론트 상수와 동일)
 *   STEP 7. (옵션) prewarm 사전 생성 검증  ── POST /api/courses/:id/prewarm-audio
 *
 * 사용법:
 *   node scripts/verify-audio.js                 # 전체 (로컬 3000 기준, DB 직접 조회)
 *   node scripts/verify-audio.js --spot=<UUID>   # 특정 스팟 지정
 *   node scripts/verify-audio.js --course=<UUID> # prewarm 까지 검증
 *   node scripts/verify-audio.js --no-network    # 외부 API 호출 없이 DB/파일만
 *
 *   # ── 원격 서버(contest/main) 검증: 로컬 DB 미사용, 서버 API만 사용 ──
 *   node scripts/verify-audio.js --remote --base=https://contest.gilbom.quest
 *   node scripts/verify-audio.js --remote --base=https://contest.gilbom.quest --spot=<UUID>
 *   node scripts/verify-audio.js --remote --base=https://contest.gilbom.quest --course=<UUID>
 *
 * 주의:
 *   - Gemini 무료 티어는 일 20회 제한 → 429 나면 그날은 대본 신규 생성 불가.
 *     이미 캐시된 스팟(spot_ai_contents)을 우선 사용하므로 캐시가 있으면 통과한다.
 *   - --remote 모드는 로컬 DB에 의존하지 않고 서버 응답만으로 검증한다.
 *   - S3는 private 버킷이라, ai-contents 응답이 presigned URL(서명 포함)이어야 재생 가능하다.
 */
require('dotenv').config();
const axios = require('axios');

// ── CLI 파싱 ──────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};
const SPOT_ID = getArg('spot');
const COURSE_ID = getArg('course');
const BASE_URL = (getArg('base') || process.env.VERIFY_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const NO_NETWORK = args.includes('--no-network');
const REMOTE = args.includes('--remote'); // 서버 API 전용 모드 (로컬 DB 미사용)

// ── DB pool: 원격 모드에서는 로드하지 않는다 ──
let pool = null;
if (!REMOTE) {
  pool = require('../config/db');
}

// ── 서버 API 헬퍼 (원격 모드) ─────────────
const api = {
  async get(path, timeout = 90000) {
    const res = await axios.get(`${BASE_URL}${path}`, { timeout, validateStatus: () => true });
    return res;
  },
  async post(path, body = {}, timeout = 15000) {
    const res = await axios.post(`${BASE_URL}${path}`, body, { timeout, validateStatus: () => true });
    return res;
  },
};

function isPresigned(url) {
  return typeof url === 'string' && /[?&]X-Amz-Signature=/.test(url);
}

// ── 색상/리포트 ───────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const icons = { OK: '✅', WARN: '⚠️', FAIL: '❌', SKIP: '⏭️', INFO: 'ℹ️' };
const results = [];
function log(status, step, detail) {
  results.push({ status, step, detail });
  const color = status === 'OK' ? C.green : status === 'WARN' ? C.yellow : status === 'FAIL' ? C.red : C.dim;
  console.log(`${icons[status]} ${color}${step}${C.reset}${detail ? '  ' + detail : ''}`);
}
const section = (t) => console.log(`\n${C.bold}${C.cyan}${t}${C.reset}`);

async function httpHead(url, timeout = 12000) {
  try {
    const res = await axios.head(url, { timeout, validateStatus: () => true });
    return { ok: res.status >= 200 && res.status < 400, status: res.status };
  } catch (e) {
    // 일부 S3/버킷은 HEAD 미지원 → GET Range로 폴백
    try {
      const res = await axios.get(url, { timeout, headers: { Range: 'bytes=0-15' }, validateStatus: () => true });
      return { ok: res.status >= 200 && res.status < 400, status: res.status };
    } catch (e2) {
      return { ok: false, status: e2.response?.status || 'ERR', err: e2.message };
    }
  }
}

// ── STEP 0. 환경/DB ───────────────────────
async function step0() {
  section('STEP 0. 환경 / 서버 연결');

  if (REMOTE) {
    log('INFO', '모드', 'REMOTE (서버 API 전용, 로컬 DB 미사용)');
    log('INFO', 'BASE', BASE_URL);
    try {
      const res = await api.get('/api/spots/health', 10000);
      const ok = res.status === 200;
      log(ok ? 'OK' : 'FAIL', '서버 헬스', `status=${res.status} ${res.data?.message || ''}`);
    } catch (e) {
      log('FAIL', '서버 연결', e.message);
    }
    return;
  }

  const dbCfg = `host=${process.env.DB_HOST || '127.0.0.1'} db=${process.env.DB_NAME || 'walkbuddy'} user=${process.env.DB_USER || '(기본)'}`;
  log('INFO', 'DB 설정', dbCfg);
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM spots WHERE status='active')              AS spots,
        (SELECT COUNT(*)::int FROM courses)                                  AS courses,
        (SELECT COUNT(*)::int FROM spot_ai_contents)                         AS ai_contents
    `);
    const { spots, courses, ai_contents } = rows[0];
    log(spots > 0 ? 'OK' : 'WARN', 'DB 데이터', `active 스팟 ${spots} · 코스 ${courses} · ai_contents ${ai_contents}`);
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='spot_ai_contents' ORDER BY ordinal_position
    `);
    const names = cols.rows.map((r) => r.column_name);
    const need = ['spot_id', 'content_type', 'script', 'audio_url'];
    const missing = need.filter((n) => !names.includes(n));
    log(missing.length === 0 ? 'OK' : 'FAIL', '스키마(spot_ai_contents)', missing.length ? `누락 컬럼: ${missing.join(',')}` : names.join(', '));
  } catch (e) {
    log('FAIL', 'DB 연결', e.message);
  }
}

// ── STEP 1. 외부 키 ───────────────────────
async function step1() {
  section('STEP 1. 외부 API 키 상태');
  if (NO_NETWORK) { log('SKIP', '외부 키 검사', '--no-network'); return; }
  if (REMOTE) { log('SKIP', '외부 키 검사', '원격 모드 — 키는 서버에 있으므로 로컬에서 검사하지 않음'); return; }
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', ['scripts/check-keys.js', '--only=gemini,tts,s3,odii'], { encoding: 'utf8' });
    out.split('\n').filter((l) => /[✅⚠️❌⏭️]/.test(l)).forEach((l) => {
      const status = /✅/.test(l) ? 'OK' : /⚠️/.test(l) ? 'WARN' : /❌/.test(l) ? 'FAIL' : 'SKIP';
      log(status, '키검사', l.replace(/[✅⚠️❌⏭️]/g, '').trim());
    });
  } catch (e) {
    log('WARN', '키검사', 'check-keys.js 실패: ' + e.message);
  }
}

// ── STEP 2. 대상 스팟 선택 ────────────────
async function pickSpot() {
  section('STEP 2. 검증 대상 스팟 선택');
  if (SPOT_ID) {
    log('INFO', '스팟(지정)', SPOT_ID);
    return SPOT_ID;
  }

  if (REMOTE) {
    // 원격 모드: --course 가 있으면 그 코스의 첫 경유지, 없으면 코스 목록에서 첫 스팟 자동 선택
    try {
      let courseId = COURSE_ID;
      if (!courseId) {
        const list = await api.get('/api/courses?limit=1', 10000);
        courseId = list.data?.courses?.[0]?.course_id;
      }
      if (!courseId) { log('FAIL', '스팟', '코스를 찾지 못했습니다. --spot=<UUID> 로 지정하세요.'); return null; }
      const detail = await api.get(`/api/courses/${courseId}`, 10000);
      const wp = (detail.data?.waypoints || []).find((w) => w.spot_id);
      if (!wp) { log('WARN', '스팟', `코스 ${courseId} 에 spot_id 연결 경유지가 없습니다. --spot 지정 권장.`); return null; }
      log('OK', '스팟(코스 자동선택)', `${wp.spot_id}  (${wp.spot_name})  ← course ${courseId}`);
      return wp.spot_id;
    } catch (e) {
      log('FAIL', '스팟 자동선택', e.message);
      return null;
    }
  }

  const cached = await pool.query(`
    SELECT spot_id, COUNT(*)::int AS n
    FROM spot_ai_contents
    WHERE audio_url IS NOT NULL AND audio_url <> ''
    GROUP BY spot_id ORDER BY n DESC LIMIT 1
  `);
  if (cached.rows.length) {
    log('OK', '스팟(캐시 보유)', `${cached.rows[0].spot_id}  (ai ${cached.rows[0].n}건)`);
    return cached.rows[0].spot_id;
  }
  const anySpot = await pool.query(`SELECT spot_id, name FROM spots WHERE status='active' LIMIT 1`);
  if (anySpot.rows.length) {
    log('WARN', '스팟(캐시 없음 → 생성 필요)', `${anySpot.rows[0].spot_id}  (${anySpot.rows[0].name})`);
    return anySpot.rows[0].spot_id;
  }
  log('FAIL', '스팟', 'active 스팟이 없습니다. 시드를 투입하세요.');
  return null;
}

// ── STEP 3. 대본(스크립트) 검증 ────────────
async function step3(spotId) {
  section('STEP 3. 스크립트(대본) 생성 검증');
  if (REMOTE) {
    log('INFO', '대본', '원격 모드 → STEP 5(ai-contents API) 응답으로 검증합니다.');
    return { hasScript: null, rows: [] };
  }
  const { rows } = await pool.query(
    `SELECT content_type, script, audio_url, updated_at
     FROM spot_ai_contents WHERE spot_id = $1
     ORDER BY content_type`,
    [spotId]
  );
  if (!rows.length) {
    log('WARN', '대본', 'DB 캐시 없음 → STEP 5 API 호출 시 생성 시도');
    return { hasScript: false, rows: [] };
  }
  let hasScript = false;
  for (const r of rows) {
    const script = r.script || '';
    const len = script.replace(/\s/g, '').length;
    const okLen = len >= 100;          // 가이드: 180~220자, 여유 허용
    const okLang = /[가-힣]/.test(script);
    if (okLen && okLang) {
      hasScript = true;
      log('OK', `대본[${r.content_type}]`, `${len}자  "${script.slice(0, 30).replace(/\n/g, ' ')}..."`);
    } else {
      log('WARN', `대본[${r.content_type}]`, `길이/언어 의심 (${len}자, 한글=${okLang})`);
    }
  }
  return { hasScript, rows };
}

// ── STEP 4. mp3(+S3) 검증 ─────────────────
async function step4(spotRows) {
  section('STEP 4. mp3 / S3 업로드 검증');
  if (REMOTE) {
    log('INFO', 'mp3', '원격 모드 → STEP 5(ai-contents API) 응답으로 검증합니다.');
    return null;
  }
  let anyAudio = false;
  for (const r of spotRows) {
    const url = r.audio_url;
    if (!url || url.includes('example.com')) {
      log('WARN', `mp3[${r.content_type}]`, 'audio_url 없음(또는 더미)');
      continue;
    }
    anyAudio = true;
    const isS3 = /amazonaws\.com|s3\./.test(url);
    log('OK', `mp3[${r.content_type}]`, `${isS3 ? 'S3' : 'URL'} ${url.slice(0, 70)}...`);
    if (!NO_NETWORK) {
      const res = await httpHead(url);
      log(res.ok ? 'OK' : 'WARN', `mp3 접근[${r.content_type}]`, `status=${res.status}${res.err ? ' ' + res.err : ''}`);
    }
  }
  if (!anyAudio) log('WARN', 'mp3', '검증된 mp3 없음 — STEP 5에서 생성됨');
  return anyAudio;
}

// ── STEP 5. ai-contents API 통합 ──────────
async function step5(spotId) {
  section(`STEP 5. ai-contents API 통합 검증  (${BASE_URL})`);
  if (NO_NETWORK) { log('SKIP', 'API', '--no-network'); return false; }
  const url = `${BASE_URL}/api/spots/${spotId}/ai-contents`;
  log('INFO', '요청', `GET ${url}`);
  try {
    const res = await axios.get(url, { timeout: 90000, validateStatus: () => true });
    if (res.status !== 200) {
      const msg = res.data?.message || res.data?.error || '';
      const is429 = /429|quota|RESOURCE_EXHAUSTED/i.test(msg);
      log(is429 ? 'WARN' : 'FAIL', 'API 응답', `status=${res.status} ${String(msg).slice(0, 160)}`);
      if (is429) log('INFO', '힌트', 'Gemini 무료 할당량 초과 → 캐시된 스팟으로 검증하거나 내일 재시도');
      return false;
    }
    const contents = res.data?.contents || [];
    if (!contents.length) { log('FAIL', 'API contents', 'contents 비어 있음'); return false; }
    let ok = true;
    for (const c of contents) {
      const hasAudio = c.audio_url && !c.audio_url.includes('example.com');
      const hasScript = c.script && /[가-힣]/.test(c.script);
      const good = hasAudio && hasScript;
      ok = ok && good;
      log(good ? 'OK' : 'WARN', `API[${c.content_type}]`, `audio=${hasAudio ? 'O' : 'X'} script=${(c.script || '').length}자`);
    }
    if (!NO_NETWORK) {
      for (const c of contents) {
        if (!c.audio_url || c.audio_url.includes('example.com')) continue;
        const isS3 = /amazonaws\.com/.test(c.audio_url);
        const signed = isPresigned(c.audio_url);
        // 자체 S3(private)는 반드시 presigned 여야 앱에서 재생됨
        if (isS3 && !signed) {
          log('WARN', `API URL종류[${c.content_type}]`, 'S3 직접 URL(서명 없음) → 403 위험! presigned 여야 함');
        } else {
          log('OK', `API URL종류[${c.content_type}]`, signed ? 'presigned(서명됨) ✅' : '외부 공개 URL ✅');
        }
        const h = await httpHead(c.audio_url);
        const isXml = h.status === 403;
        log(h.ok ? 'OK' : 'WARN', `API mp3 접근[${c.content_type}]`, `status=${h.status}${isXml ? ' (403 → 서명 만료/미적용)' : ''}`);
      }
    }
    return ok;
  } catch (e) {
    log('FAIL', 'API 호출', e.message + (e.code === 'ECONNREFUSED' ? ` → 서버(${BASE_URL}) 미실행이면 'npm run dev'` : ''));
    return false;
  }
}

// ── STEP 6. 근접 트리거 시뮬레이션 ────────
async function step6(spotId) {
  section('STEP 6. 근접 트리거(≤100m) 로직 시뮬레이션');

  let name, spotLat, spotLng;
  if (REMOTE) {
    try {
      const res = await api.get(`/api/spots/${spotId}`, 10000);
      const s = res.data?.spot || res.data;
      if (!s || s.lat == null || s.lng == null) {
        // 좌표 필드명이 다를 수 있음
        const lat = s?.latitude ?? s?.y;
        const lng = s?.longitude ?? s?.x;
        if (lat == null || lng == null) { log('FAIL', '스팟 좌표', 'API 응답에 좌표 없음'); return; }
        name = s?.name; spotLat = Number(lat); spotLng = Number(lng);
      } else {
        name = s.name; spotLat = Number(s.lat); spotLng = Number(s.lng);
      }
    } catch (e) {
      log('FAIL', '스팟 좌표', 'API 조회 실패: ' + e.message);
      return;
    }
  } else {
    const { rows } = await pool.query(
      `SELECT name, ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y
       FROM spots WHERE spot_id = $1`, [spotId]
    );
    if (!rows.length) { log('FAIL', '스팟 좌표', '스팟 없음'); return; }
    name = rows[0].name;
    spotLat = Number(rows[0].y);   // PostgreSQL은 문자열로 반환 → 명시적 캐스팅 필수
    spotLng = Number(rows[0].x);
  }
  log('INFO', '스팟', `${name}  (lng=${spotLng.toFixed(5)}, lat=${spotLat.toFixed(5)})`);

  // 프론트 WalkRecordingScreen.kt 와 동일한 Haversine
  const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const TRIGGER_M = 100.0; // WalkRecordingScreen.kt 하드코딩 값
  // 위도(남북) 1도 ≈ 111,320m → 특정 미터만큼 떨어진 위도 델타
  const latDelta = (m) => m / 111320;
  const cases = [
    ['정확히 스팟 위', spotLat, spotLng, 0],
    ['50m 근접', spotLat + latDelta(50), spotLng, 50],
    ['99m 간신히', spotLat + latDelta(99), spotLng, 99],
    ['150m (미발동)', spotLat + latDelta(150), spotLng, 150],
  ];
  for (const [label, lat, lng, expect] of cases) {
    const d = haversine(spotLat, spotLng, lat, lng);
    const fires = d <= TRIGGER_M;
    const shouldFire = expect <= TRIGGER_M;
    const ok = fires === shouldFire;
    log(ok ? 'OK' : 'FAIL', `시나리오: ${label}`, `거리≈${d.toFixed(1)}m → ${fires ? '재생 발동 🔊' : '미발동'} (기대 ${shouldFire ? '발동' : '미발동'})`);
  }
  log('INFO', '트리거 상수', 'RADIUS=100m, Geofence=50m (LocalGeofenceManager), 1회성(shownSpotIndices)');
}

// ── STEP 7. prewarm 검증 ──────────────────
async function step7(courseId) {
  if (!courseId) { log('SKIP', 'prewarm', '--course=<UUID> 미지정'); return; }
  section(`STEP 7. prewarm 사전 생성 검증  (course=${courseId})`);
  if (NO_NETWORK) { log('SKIP', 'prewarm', '--no-network'); return; }

  let target;
  if (REMOTE) {
    const detail = await api.get(`/api/courses/${courseId}`, 10000);
    const spotIds = new Set((detail.data?.waypoints || []).filter((w) => w.spot_id).map((w) => w.spot_id));
    target = spotIds.size;
  } else {
    const before = await pool.query(
      `SELECT COUNT(DISTINCT spot_id)::int AS n FROM course_waypoints WHERE course_id=$1 AND spot_id IS NOT NULL`,
      [courseId]
    );
    target = before.rows[0].n;
  }
  log('INFO', '코스 경유지 스팟', `${target}개`);
  if (target === 0) { log('WARN', 'prewarm', '경유지에 spot_id가 없습니다.'); return; }

  try {
    const res = await api.post(`/api/courses/${courseId}/prewarm-audio`);
    log(res.status === 202 || res.status === 200 ? 'OK' : 'WARN', 'prewarm 요청', `status=${res.status} ${res.data?.message || ''}`);
  } catch (e) {
    log('FAIL', 'prewarm 요청', e.message);
    return;
  }

  // 진행 확인: 원격은 코스 상세의 spot_id들에 대해 ai-contents 존재 여부 polling
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    let done = 0;
    if (REMOTE) {
      const detail = await api.get(`/api/courses/${courseId}`, 10000);
      const ids = [...new Set((detail.data?.waypoints || []).filter((w) => w.spot_id).map((w) => w.spot_id))];
      for (const id of ids) {
        const r = await api.get(`/api/spots/${id}/ai-contents`, 60000);
        const ok = (r.data?.contents || []).some((c) => c.audio_url && !c.audio_url.includes('example.com'));
        if (ok) done += 1;
      }
    } else {
      const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT c.spot_id)::int AS n
         FROM spot_ai_contents c
         JOIN course_waypoints w ON w.spot_id = c.spot_id AND w.course_id = $1
         WHERE c.audio_url IS NOT NULL AND c.audio_url <> ''`,
        [courseId]
      );
      done = rows[0].n;
    }
    log(done >= target ? 'OK' : 'INFO', 'prewarm 진행', `${done}/${target} (${i * 5 + 5}s)`);
    if (done >= target) return;
  }
  log('WARN', 'prewarm', '제한 시간 내 완료 안 됨 (Gemini 429 또는 경유지 spotId 없음 가능)');
}

// ── 메인 ──────────────────────────────────
(async () => {
  console.log(`\n${C.bold}=== 🎧 길봄 음성 안내 검증 (verify-audio.js) ===${C.reset}`);
  console.log(`${C.dim}BASE=${BASE_URL}  network=${NO_NETWORK ? 'off' : 'on'}${C.reset}`);

  try {
    await step0();
    await step1();
    const spotId = await pickSpot();
    if (!spotId) throw new Error('검증할 스팟을 찾지 못했습니다.');
    const { rows } = await step3(spotId);
    await step4(rows);
    await step5(spotId);

    if (REMOTE) {
      section('STEP 5-b. ai-contents API 재조회 (원격)');
      const r = await api.get(`/api/spots/${spotId}/ai-contents`, 90000);
      const cs = r.data?.contents || [];
      if (cs.length) {
        cs.forEach((c) =>
          log(c.audio_url ? 'OK' : 'WARN', `API[${c.content_type}]`, `script ${(c.script || '').length}자 / audio ${c.audio_url ? 'O' : 'X'} ${isPresigned(c.audio_url) ? '(signed)' : ''}`)
        );
      } else log('INFO', 'API', 'contents 없음');
    } else {
      const after = await pool.query(
        `SELECT content_type, script, audio_url FROM spot_ai_contents WHERE spot_id=$1 ORDER BY content_type`,
        [spotId]
      );
      section('STEP 5-b. 생성 후 DB 재확인');
      if (after.rows.length) {
        after.rows.forEach((r) =>
          log(r.audio_url ? 'OK' : 'WARN', `DB[${r.content_type}]`, `script ${(r.script || '').length}자 / audio ${r.audio_url ? 'O' : 'X'}`)
        );
      } else {
        log('INFO', 'DB', 'ai_contents 없음(캐시 미생성)');
      }
    }

    await step6(spotId);
    await step7(COURSE_ID);

    section('── 요약 ──');
    const cnt = (s) => results.filter((r) => r.status === s).length;
    console.log(`OK=${cnt('OK')}  WARN=${cnt('WARN')}  FAIL=${cnt('FAIL')}  SKIP=${cnt('SKIP')}`);
    const problems = results.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
    if (problems.length) {
      console.log(`\n${C.yellow}⚠️ 확인 필요:${C.reset}`);
      problems.forEach((r) => console.log(`  - [${r.status}] ${r.step}: ${r.detail}`));
    } else {
      console.log(`\n${C.green}🎉 모든 검증 통과 — 다가가면 음성이 재생됩니다.${C.reset}`);
    }
    console.log('');
  } catch (e) {
    console.error(`\n${C.red}스크립트 예외: ${e.message}${C.reset}\n`);
  } finally {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  }
})();
