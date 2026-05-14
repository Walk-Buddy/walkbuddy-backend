require('dotenv').config();
const { Pool } = require('pg');
const os = require('os');

/**
 * 로컬 PostgreSQL
 * - host 기본: 127.0.0.1
 * - user 기본: 현재 OS 로그인 이름
 * - database 기본: walkbuddy
 * 

 * TCP(127.0.0.1 등) + SCRAM: .env에 DB_PASSWORD 필수.
 * 빈 문자열을 넘기면 node-pg가 비밀번호를 버려 SCRAM 단계에서 오류가 납니다.
 */
function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    const cfg = { connectionString: process.env.DATABASE_URL };
    if (process.env.DB_SSL === 'true') {
      cfg.ssl = { rejectUnauthorized: false };
    }
    return cfg;
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const database = process.env.DB_NAME || 'walkbuddy';
  const user = process.env.DB_USER || os.userInfo().username || 'postgres';

  const cfg = {
    host,
    port,
    database,
    user,
    max: 20,
    idleTimeoutMillis: 30000,
  };

  if (process.env.DB_PASSWORD) {
    cfg.password = process.env.DB_PASSWORD;
  }

  return cfg;
}

function friendlyDbError(err) {
  const m = err && err.message;
  if (typeof m !== 'string') return err;
  if (m.includes('SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')) {
    const e = new Error(
      'DB 비밀번호가 없습니다. 프로젝트 루트 .env에 DB_PASSWORD를 넣거나 DATABASE_URL을 설정한 뒤 서버를 다시 시작하세요.'
    );
    e.code = err.code;
    return e;
  }
  if (m.includes('SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string')) {
    const e = new Error(
      'DB 비밀번호가 비어 있습니다. .env의 DB_PASSWORD에 Postgres 사용자 비밀번호를 입력하세요.'
    );
    e.code = err.code;
    return e;
  }
  return err;
}

const poolConfig = buildPoolConfig();
const usesTcp =
  !poolConfig.connectionString && !(String(poolConfig.host || '').startsWith('/'));

if (usesTcp && !poolConfig.password) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  [DB] .env에 DB_PASSWORD가 없습니다. PostgreSQL SCRAM 때문에 API가 실패합니다.\n' +
      '   → .env에 DB_PASSWORD=실제비밀번호 를 넣고 서버를 다시 시작하세요.\n' +
      '   → 또는 DATABASE_URL=postgresql://유저:비번@127.0.0.1:5432/walkbuddy\n'
  );
}

const pool = new Pool(poolConfig);
const _query = pool.query.bind(pool);
const _connect = pool.connect.bind(pool);

/** pg는 query( sql, cb )처럼 콜백이 있으면 undefined를 반환함 → undefined.catch 방지 */
function wrapMaybePromise(p) {
  if (p != null && typeof p.then === 'function') {
    return p.catch((err) => Promise.reject(friendlyDbError(err)));
  }
  return p;
}

pool.query = (...args) => wrapMaybePromise(_query(...args));
pool.connect = (...args) => wrapMaybePromise(_connect(...args));

module.exports = pool;
