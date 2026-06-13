require('dotenv').config();

const { spawn } = require('child_process');
const http = require('http');

const cwd = process.cwd();
const port = process.env.PORT || '3000';
const baseUrl = process.env.SEED_API_BASE_URL || `http://localhost:${port}`;
const includeDurunubi = process.argv.includes('--with-durunubi');

function runNode(args, label, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n[seed] ${label}`);
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} 실패 (exit code: ${code})`));
    });
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${baseUrl}/health`, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await checkHealth()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`서버가 준비되지 않았습니다: ${baseUrl}/health`);
}

async function ensureServer() {
  if (await checkHealth()) {
    console.log(`[seed] 기존 서버 사용: ${baseUrl}`);
    return null;
  }

  console.log(`\n[seed] 임시 서버 시작: ${baseUrl}`);
  const child = spawn(process.execPath, ['app.js'], {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[seed] 임시 서버 종료됨 (exit code: ${code})`);
    }
  });

  await waitForHealth();
  return child;
}

async function main() {
  await runNode(['db/run-sql.js', 'db/reset.sql'], 'DB 초기화');
  await runNode(['db/run-sql.js', 'db/schema.sql'], 'DB 스키마 재구성');
  await runNode(['db/run-sql.js', 'db/seed.sql'], '기존 seed 데이터 입력');

  if (includeDurunubi) {
    await runNode(['scripts/import-durunubi-courses.js'], '두루누비 코스 import');
  } else {
    console.log('\n[seed] 두루누비 코스 import 건너뜀');
    console.log('[seed] 필요할 때만 실행: npm run import:durunubi 또는 npm run seed:full');
  }

  const server = await ensureServer();
  try {
    await runNode(
      ['scripts/create-prewalk-course-via-api.js'],
      '서울여대 주변 산책 코스 API 생성',
      { SEED_API_BASE_URL: baseUrl }
    );
  } finally {
    if (server) {
      server.kill('SIGTERM');
    }
  }

  console.log('\n[seed] 시연용 기본 데이터 생성 완료');
  console.log('[seed] 후기 데이터는 별도 명령으로 추가하세요: npm run seed:prewalk-reviews');
}

main().catch((err) => {
  console.error(`\n[seed] 실패: ${err.message}`);
  process.exit(1);
});
