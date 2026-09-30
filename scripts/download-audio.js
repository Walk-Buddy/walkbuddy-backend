#!/usr/bin/env node
/**
 * scripts/download-audio.js
 * ─────────────────────────────────────────────────────────────
 * contest/main 서버에 생성된 TTS 음성(mp3)을 전부 내려받는다.
 *
 * 자체 S3 버킷은 private 이라 "직접 URL"로는 403(AccessDenied)이 난다.
 * 이 스크립트는:
 *   1) 코스 목록 → 경유지(spot_id) 수집
 *   2) 각 스팟의 /api/spots/:id/ai-contents 조회
 *   3) audio_url 이 자체 S3 직접 URL이면 → /api/upload/{key} 로 presigned URL 발급
 *   4) presigned URL로 mp3 다운로드 (실제 재생 가능한 파일)
 *
 * 사용법:
 *   node scripts/download-audio.js --base=https://contest.gilbom.quest
 *   node scripts/download-audio.js --base=https://contest.gilbom.quest --out=./contest-audio
 *   node scripts/download-audio.js --base=https://contest.gilbom.quest --theme=tour
 *   node scripts/download-audio.js --base=https://contest.gilbom.quest --limit=3
 *
 * 옵션:
 *   --base=<url>      대상 서버 (기본 http://localhost:3000)
 *   --out=<dir>       저장 폴더 (기본 ./downloaded-audio)
 *   --theme=<name>    특정 테마만 (place|history|tour)
 *   --limit=<n>       코스 개수 제한 (테스트용)
 *   --concurrency=<n> 동시 다운로드 수 (기본 4)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ── CLI ──────────────────────────────────
const args = process.argv.slice(2);
const getArg = (n) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};
const BASE = (getArg('base') || 'http://localhost:3000').replace(/\/$/, '');
const OUT = getArg('out') || './downloaded-audio';
const THEME = getArg('theme');
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const CONC = getArg('concurrency') ? parseInt(getArg('concurrency'), 10) : 4;

// ── 색상/로그 ─────────────────────────────
const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m' };
const ok = (m) => console.log(`${C.grn}✅${C.r} ${m}`);
const warn = (m) => console.log(`${C.yel}⚠️${C.r} ${m}`);
const err = (m) => console.log(`${C.red}❌${C.r} ${m}`);
const info = (m) => console.log(`${C.cyn}ℹ️${C.r} ${m}`);

const api = {
  async get(p, timeout = 90000) {
    return axios.get(`${BASE}${p}`, { timeout, validateStatus: () => true });
  },
};

// S3 presigned URL 발급 (key 추출 → /api/upload/{key})
async function resolvePlayableUrl(audioUrl) {
  if (!audioUrl) return null;
  if (audioUrl.includes('example.com')) return null;
  if (/[?&]X-Amz-Signature=/.test(audioUrl)) return audioUrl; // 이미 서명됨

  const m = audioUrl.match(/amazonaws\.com\/(.+)$/);
  if (!m) return audioUrl; // Odii 등 외부 공개 URL은 그대로

  const key = m[1];
  try {
    const res = await api.get(`/api/upload/${encodeURIComponent(key)}`, 15000);
    if (res.status === 200 && res.data?.url) return res.data.url;
  } catch (_) {}
  return null; // 발급 실패 → 접근 불가
}

function safeName(s) {
  return String(s || 'unknown').replace(/[^\w가-힣.-]+/g, '_').slice(0, 80);
}

async function downloadOne(spot, content, courseName) {
  const theme = content.content_type;
  const script = content.script || '';
  const rawUrl = content.audio_url;

  const dir = path.join(OUT, safeName(courseName));
  fs.mkdirSync(dir, { recursive: true });

  const baseName = `${safeName(spot.spot_name || spot.spot_id)}__${theme}`;
  // 대본 저장
  fs.writeFileSync(path.join(dir, baseName + '.txt'), `[${spot.spot_name} / ${theme}]\n\n${script}`, 'utf8');

  if (!rawUrl || rawUrl.includes('example.com')) {
    warn(`  ${spot.spot_name} / ${theme} : 더미(음성 없음) — 대본만 저장`);
    return { theme, status: 'dummy' };
  }

  const playable = await resolvePlayableUrl(rawUrl);
  if (!playable) {
    warn(`  ${spot.spot_name} / ${theme} : URL 변환 실패`);
    return { theme, status: 'fail' };
  }

  try {
    const res = await axios.get(playable, { responseType: 'arraybuffer', timeout: 60000, validateStatus: () => true });
    const buf = Buffer.from(res.data);
    if (res.status !== 200 || buf.length < 1000) {
      warn(`  ${spot.spot_name} / ${theme} : 다운로드 실패(status=${res.status}, ${buf.length}B)`);
      return { theme, status: 'fail' };
    }
    const fname = path.join(dir, baseName + '.mp3');
    fs.writeFileSync(fname, buf);
    ok(`  ${spot.spot_name} / ${theme} : ${(buf.length / 1024).toFixed(0)}KB 저장`);
    return { theme, status: 'ok', bytes: buf.length };
  } catch (e) {
    err(`  ${spot.spot_name} / ${theme} : ${e.message}`);
    return { theme, status: 'fail' };
  }
}

async function main() {
  console.log(`\n${C.b}=== 🎧 서버 음성 전체 다운로드 ===${C.r}`);
  console.log(`${C.d}BASE=${BASE}  OUT=${path.resolve(OUT)}  theme=${THEME || 'all'}${C.r}\n`);

  // 1) 코스 목록
  const listRes = await api.get('/api/courses?limit=100', 20000);
  let courses = listRes.data?.courses || [];
  if (LIMIT) courses = courses.slice(0, LIMIT);
  info(`코스 ${courses.length}개 조회됨`);

  // 2) 각 코스의 경유지 spot_id 수집 (스팟 이름 포함)
  const spots = new Map(); // spot_id -> { spot_id, spot_name, courseName }
  for (const course of courses) {
    try {
      const detail = await api.get(`/api/courses/${course.course_id}`, 20000);
      for (const w of detail.data?.waypoints || []) {
        if (w.spot_id && !spots.has(w.spot_id)) {
          spots.set(w.spot_id, { spot_id: w.spot_id, spot_name: w.spot_name, courseName: course.name });
        }
      }
    } catch (_) {}
  }
  info(`고유 스팟 ${spots.size}개 수집됨\n`);

  // 3) 각 스팟 ai-contents → mp3 다운로드
  const summary = { ok: 0, dummy: 0, fail: 0, total: 0 };
  const spotList = [...spots.values()];
  let done = 0;

  const worker = async (start) => {
    let i = start;
    while (i < spotList.length) {
      const idx = i;
      i += CONC;
      const spot = spotList[idx];
      try {
        const res = await api.get(`/api/spots/${spot.spot_id}/ai-contents`, 90000);
        let contents = res.data?.contents || [];
        if (THEME) contents = contents.filter((c) => c.content_type === THEME);
        for (const c of contents) {
          summary.total++;
          const r = await downloadOne(spot, c, spot.courseName);
          summary[r.status] = (summary[r.status] || 0) + 1;
        }
      } catch (e) {
        warn(`  [${spot.spot_name}] ai-contents 조회 실패: ${e.message}`);
      }
      process.stdout.write(`\r${C.d}진행 ${++done}/${spotList.length} 스팟...${C.r}`);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONC, spotList.length || 1) }, (_, i) => worker(i))
  );
  process.stdout.write('\n\n');

  console.log(`${C.b}── 다운로드 요약 ──${C.r}`);
  console.log(`스팟 ${spotList.length}개 / 음성 콘텐츠 ${summary.total}건`);
  ok(`정상 mp3 저장: ${summary.ok}건`);
  warn(`더미(없음): ${summary.dummy}건`);
  err(`실패: ${summary.fail}건`);
  console.log(`\n저장 위치: ${path.resolve(OUT)}\n`);
}

main().catch((e) => {
  err(`스크립트 예외: ${e.message}`);
  process.exit(1);
});
