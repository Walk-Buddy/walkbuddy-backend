#!/usr/bin/env node
/**
 * scripts/check-keys.js
 * ─────────────────────────────────────────────────────────────
 * .env 에 설정된 외부 API 키들이 "실제로 정상 작동하는지" 검사한다.
 * 값은 절대 출력하지 않고 마스킹만 한다.
 *
 * 사용법:
 *   node scripts/check-keys.js            # 전체 검사
 *   node scripts/check-keys.js --only=gemini,kakao   # 특정 항목만
 *   node scripts/check-keys.js --list     # 설정 여부만(호출 없이) 빠르게
 */
require('dotenv').config();
const axios = require('axios');

const MASK = (v) => {
  if (v === undefined || v === null || v === '') return '(미설정)';
  const s = String(v);
  if (s.length <= 8) return s[0] + '*'.repeat(Math.max(s.length - 2, 0)) + s.slice(-1);
  return s.slice(0, 4) + '*'.repeat(Math.min(s.length - 8, 16)) + s.slice(-4);
};

const only = (() => {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  return arg ? new Set(arg.split('=')[1].split(',').map((s) => s.trim())) : null;
})();
const LIST_ONLY = process.argv.includes('--list');

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : status === 'SKIP' ? '⏭️' : '❌';
  console.log(`${icon} ${name.padEnd(24)} ${detail}`);
}

async function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout(${ms}ms)`)), ms)),
  ]);
}

// ─────────────────────────────────────────────────────────────
// 1. 공공데이터포털 (TourAPI KorService2 / Durunubi / Odii 공용 키)
// ─────────────────────────────────────────────────────────────
async function checkPublicDataKey() {
  const key = process.env.TOURAPI_SERVICE_KEY || process.env.TOUR_API_SERVICE_KEY || process.env.DURUNUBI_SERVICE_KEY;
  if (!key) return record('공공데이터포털 키', 'FAIL', '키 미설정');
  try {
    const url = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
    const res = await withTimeout(axios.get(url, {
      params: { serviceKey: key, MobileOS: 'ETC', MobileApp: 'WalkBuddy', _type: 'json', numOfRows: 1, pageNo: 1, areaCode: 1 },
    }));
    const header = res.data?.response?.header;
    if (header?.resultCode === '0000') return record('공공데이터포털 키', 'OK', `resultCode=${header.resultCode} (KorService2 areaBasedList2 인증 성공)`);
    return record('공공데이터포털 키', 'FAIL', `resultCode=${header?.resultCode} msg=${header?.resultMsg}`);
  } catch (e) {
    return record('공공데이터포털 키', 'FAIL', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Odii 오디오 가이드 (위치기반)
// ─────────────────────────────────────────────────────────────
async function checkOdiiKey() {
  const key = process.env.ODII_API_KEY || process.env.TOURAPI_SERVICE_KEY || process.env.TOUR_API_KEY;
  if (!key) return record('Odii 키', 'FAIL', '키 미설정');
  try {
    const url = 'https://apis.data.go.kr/B551011/Odii/storyLocationBasedList';
    const res = await withTimeout(axios.get(url, {
      params: { serviceKey: key, MobileOS: 'ETC', MobileApp: 'WalkBuddy', _type: 'json', langCode: 'ko', mapX: 127.0, mapY: 37.5, radius: 300, numOfRows: 1, pageNo: 1 },
    }));
    const header = res.data?.response?.header;
    if (header?.resultCode === '0000') return record('Odii 키', 'OK', `resultCode=${header.resultCode}`);
    return record('Odii 키', 'WARN', `resultCode=${header?.resultCode} msg=${header?.resultMsg}`);
  } catch (e) {
    return record('Odii 키', 'FAIL', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 카카오 REST API (로컬 검색) + 클라이언트 시크릿
// ─────────────────────────────────────────────────────────────
async function checkKakao() {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return record('카카오 REST 키', 'FAIL', '키 미설정');
  try {
    const res = await withTimeout(axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
      headers: { Authorization: `KakaoAK ${key}` },
      params: { query: '춘천', size: 1 },
    }));
    record('카카오 REST 키', 'OK', `status=${res.status} (장소검색 성공)`);
  } catch (e) {
    record('카카오 REST 키', 'FAIL', e.response ? `status=${e.response.status}` : e.message);
  }

  // 클라이언트 시크릿 검증: 카카오 토큰 엔드포인트에 잘못된 코드로 시도 → invalid_client 여부 확인
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (!secret) return record('카카오 시크릿', 'FAIL', '미설정');
  try {
    await withTimeout(axios.post('https://kauth.kakao.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: key,
        client_secret: secret,
        redirect_uri: process.env.KAKAO_REDIRECT_URI || '',
        code: 'invalid_test_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ));
    record('카카오 시크릿', 'WARN', '예상외 200 응답(코드 유효성 의심)');
  } catch (e) {
    const data = e.response?.data;
    const code = data?.error;
    if (code === 'invalid_grant') return record('카카오 시크릿', 'OK', 'invalid_grant = 시크릿/키 유효 (코드만 무효)');
    if (code === 'invalid_client') return record('카카오 시크릿', 'FAIL', 'invalid_client = 시크릿/키 불일치');
    record('카카오 시크릿', 'WARN', `status=${e.response?.status} err=${code || e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Gemini API (키별 개별 검사)
// ─────────────────────────────────────────────────────────────
function getGeminiKeys() {
  const raw = [];
  if (process.env.GEMINI_API_KEY) raw.push(...process.env.GEMINI_API_KEY.split(','));
  if (process.env.GEMINI_API_KEY_2) raw.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEYS) raw.push(...process.env.GEMINI_API_KEYS.split(','));
  return [...new Set(raw.map((k) => k && k.trim()).filter((k) => k && !k.startsWith('#') && !k.startsWith('//')))];
}

async function checkGemini() {
  const keys = getGeminiKeys();
  if (!keys.length) return record('Gemini 키', 'FAIL', '키 미설정');
  for (let i = 0; i < keys.length; i++) {
    const label = `Gemini 키#${i + 1} ${MASK(keys[i])}`;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys[i]}`;
      const res = await withTimeout(axios.post(url, { contents: [{ parts: [{ text: 'ping' }] }] }), 20000);
      if (res.data?.candidates) record(label, 'OK', 'generateContent 성공');
      else record(label, 'WARN', `예상외 응답: ${JSON.stringify(res.data).slice(0, 80)}`);
    } catch (e) {
      const st = e.response?.status;
      const msg = e.response?.data?.error?.message || e.message;
      if (st === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) record(label, 'FAIL', '유효하지 않은 키');
      else if (st === 429) record(label, 'WARN', '할당량 초과(429) — 폴백 대상');
      else if (/^AQ\./.test(keys[i])) record(label, 'WARN', `신규 AQ. 토큰 형식: ${msg.slice(0, 100)}`);
      else record(label, 'FAIL', `${st || ''} ${msg.slice(0, 120)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Google TTS (Neural2)
// ─────────────────────────────────────────────────────────────
async function checkGoogleTts() {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return record('Google TTS 키', 'FAIL', '키 미설정');
  try {
    const res = await withTimeout(axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      { input: { text: '테스트' }, voice: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A' }, audioConfig: { audioEncoding: 'MP3' } }
    ));
    if (res.data?.audioContent) record('Google TTS 키', 'OK', `Neural2-A 합성 성공 (${res.data.audioContent.length} b64)`);
    else record('Google TTS 키', 'WARN', 'audioContent 없음');
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    record('Google TTS 키', 'FAIL', `${e.response?.status || ''} ${msg.slice(0, 120)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 6. T맵 보행자 경로 API
// ─────────────────────────────────────────────────────────────
async function checkTmap() {
  const key = process.env.TMAP_API_KEY;
  if (!key) return record('T맵 키', 'FAIL', '키 미설정');
  try {
    const res = await withTimeout(axios.post('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1',
      { startX: '127.0', startY: '37.5', endX: '127.01', endY: '37.51', startName: '출발', endName: '도착', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0' },
      { headers: { 'Content-Type': 'application/json', appKey: key } }
    ));
    if (res.data?.features?.length) record('T맵 키', 'OK', `status=${res.status} features=${res.data.features.length}`);
    else record('T맵 키', 'WARN', `status=${res.status} features 없음`);
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
    record('T맵 키', 'FAIL', `${e.response?.status || ''} ${String(msg).slice(0, 120)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 7. AWS S3 (TTS mp3 업로드 대상)
// ─────────────────────────────────────────────────────────────
async function checkS3() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) return record('AWS S3', 'FAIL', 'S3_BUCKET_NAME 미설정');
  // .env에 키가 없는 것은 의도된 설계(EC2 IAM Role 등 기본 자격증명 체인 사용).
  // 여기서는 기본 체인으로 버킷 접근이 되는지만 확인한다.
  const hasStaticKey = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  try {
    const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region }); // 자격증명 미지정 → 기본 체인(IAM Role 등)
    await withTimeout(s3.send(new HeadBucketCommand({ Bucket: bucket })), 10000);
    record('AWS S3', 'OK', `headBucket 성공 (${MASK(bucket)}, 인증=${hasStaticKey ? '정적 키' : '기본 체인/IAM Role'})`);
  } catch (e) {
    const hint = !hasStaticKey
      ? ' (로컬에선 IAM Role이 없어 실패할 수 있음 — 서버에서는 정상)'
      : '';
    record('AWS S3', hasStaticKey ? 'FAIL' : 'WARN', `${e.name || ''} ${e.message}${hint}`.slice(0, 160));
  }
}

// ─────────────────────────────────────────────────────────────
// 8. 메일 (SMTP / Gmail 앱 비밀번호)
// ─────────────────────────────────────────────────────────────
async function checkMail() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) return record('메일 인증', 'FAIL', 'MAIL_USER/MAIL_PASS 미설정');
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return record('메일 인증', 'SKIP', 'nodemailer 미설치'); }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  try {
    await withTimeout(transporter.verify(), 12000);
    record('메일 인증', 'OK', `${host}:${port} 인증 성공 (${MASK(user)})`);
  } catch (e) {
    record('메일 인증', 'FAIL', `${e.code || ''} ${e.message}`.slice(0, 140));
  }
}

// ─────────────────────────────────────────────────────────────
// 9. JWT 시크릿 (존재/길이만)
// ─────────────────────────────────────────────────────────────
function checkJwt() {
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_VERIFY_SECRET']) {
    const v = process.env[k];
    if (!v) record(k, 'FAIL', '미설정');
    else if (v.length < 32) record(k, 'WARN', `길이 ${v.length} (32자 이상 권장)`);
    else record(k, 'OK', `설정됨 (len=${v.length})`);
  }
}

// ─────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== WalkBuddy 키 상태 검사 ===');
  console.log('(.env 값은 마스킹됩니다)\n');

  if (LIST_ONLY) {
    checkJwt();
  } else {
    checkJwt();
    const checks = [
      ['publicdata', checkPublicDataKey],
      ['odii', checkOdiiKey],
      ['kakao', checkKakao],
      ['gemini', checkGemini],
      ['tts', checkGoogleTts],
      ['tmap', checkTmap],
      ['s3', checkS3],
      ['mail', checkMail],
    ];
    for (const [id, fn] of checks) {
      if (only && !only.has(id)) continue;
      try { await fn(); } catch (e) { record(id, 'FAIL', `검사 중 예외: ${e.message}`); }
    }
  }

  console.log('\n── 요약 ──');
  const ok = results.filter((r) => r.status === 'OK').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`OK=${ok}  WARN=${warn}  FAIL=${fail}  SKIP=${skip}`);
  const problems = results.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
  if (problems.length) {
    console.log('\n⚠️ 확인 필요:');
    problems.forEach((r) => console.log(`  - [${r.status}] ${r.name}: ${r.detail}`));
  }
  console.log('');
})();
