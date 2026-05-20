const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const emailUtil = require('../utils/email');

const BCRYPT_ROUNDS = 12;
const VERIFY_CODE_EXPIRES_SEC = 180; // 3분

// ──────────────────────────────────────────────────────────────────────
// 이메일 사용 가능 여부 확인
// ──────────────────────────────────────────────────────────────────────
exports.isEmailAvailable = async (email) => {
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return rows.length === 0; // true = 사용 가능
};

// ──────────────────────────────────────────────────────────────────────
// 닉네임 사용 가능 여부 확인
// ──────────────────────────────────────────────────────────────────────
exports.isNicknameAvailable = async (nickname) => {
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE nickname = $1 LIMIT 1',
    [nickname]
  );
  return rows.length === 0;
};

// ──────────────────────────────────────────────────────────────────────
// 인증코드 생성 → JWT에 담아 서버 보관용 토큰 반환 + 이메일 발송
//
// [설계 근거 - schema.sql 주석 기반]
// "서버: 6자리 코드 생성, JWT(payload: email, code, exp 3분)로 서버 보관"
// → JWT를 서버 메모리/DB에 저장하지 않고 토큰 자체가 상태를 담음
// → 클라이언트는 토큰을 받지 않음 (서버가 env에서 관리)
//
// 실제 구현: JWT를 서버 측 메모리 Map에 캐싱 (단일 서버 환경)
//            다중 서버 환경이면 Redis로 교체 권장
// ──────────────────────────────────────────────────────────────────────

// 인증 토큰 임시 저장소 (email → jwt)
// 실운영에서 다중 인스턴스라면 Redis로 교체
const verifyStore = new Map();

exports.sendVerifyCode = async (email) => {
  // 6자리 숫자 코드 생성
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // JWT 생성 (payload: email, code / exp: 3분)
  const token = jwt.sign(
    { email, code },
    process.env.JWT_VERIFY_SECRET,
    { expiresIn: VERIFY_CODE_EXPIRES_SEC }
  );

  // 이메일당 하나만 유지 (재발송 시 이전 토큰 덮어쓰기)
  verifyStore.set(email, token);

  // 이메일 발송
  await emailUtil.sendVerificationEmail(email, code);

  return { expiresIn: VERIFY_CODE_EXPIRES_SEC };
};

// ──────────────────────────────────────────────────────────────────────
// 인증코드 검증 → 성공 시 verify_token 반환
// verify_token: 회원가입 완료 단계에서 "인증이 끝난 이메일"임을 증명
// ──────────────────────────────────────────────────────────────────────
exports.confirmVerifyCode = async (email, inputCode) => {
  const storedToken = verifyStore.get(email);

  if (!storedToken) {
    const err = new Error('인증 요청이 없거나 만료되었습니다. 인증코드를 다시 요청해주세요.');
    err.status = 400;
    throw err;
  }

  // JWT 검증 (만료·서명 이상 모두 체크)
  let payload;
  try {
    payload = jwt.verify(storedToken, process.env.JWT_VERIFY_SECRET);
  } catch (e) {
    verifyStore.delete(email);
    if (e.name === 'TokenExpiredError') {
      const err = new Error('인증 시간이 만료되었습니다. (3분) 인증코드를 다시 요청해주세요.');
      err.status = 400;
      throw err;
    }
    const err = new Error('인증 토큰이 유효하지 않습니다.');
    err.status = 400;
    throw err;
  }

  // 코드 일치 여부
  if (payload.code !== inputCode) {
    const err = new Error('인증코드가 일치하지 않습니다.');
    err.status = 400;
    throw err;
  }

  // 인증 완료 → verifyStore에서 제거 (재사용 방지)
  verifyStore.delete(email);

  // verify_token 발급: 회원가입 완료 단계까지만 유효 (10분)
  const verifyToken = jwt.sign(
    { email, purpose: 'register' },
    process.env.JWT_VERIFY_SECRET,
    { expiresIn: 600 } // 10분
  );

  return verifyToken;
};

// ──────────────────────────────────────────────────────────────────────
// 회원가입 최종 완료
// verify_token 검증 → users INSERT
// ──────────────────────────────────────────────────────────────────────
exports.register = async ({ email, password, nickname, verifyToken }) => {
  // 1. verify_token 검증
  let tokenPayload;
  try {
    tokenPayload = jwt.verify(verifyToken, process.env.JWT_VERIFY_SECRET);
  } catch (e) {
    const err = new Error('이메일 인증이 만료되었거나 유효하지 않습니다. 인증을 다시 진행해주세요.');
    err.status = 400;
    throw err;
  }

  // 토큰의 이메일과 요청 이메일 일치 확인
  if (tokenPayload.email !== email || tokenPayload.purpose !== 'register') {
    const err = new Error('인증 정보가 일치하지 않습니다.');
    err.status = 400;
    throw err;
  }

  // 2. 이메일·닉네임 최종 중복 확인 (동시 요청 방어)
  const emailAvailable = await exports.isEmailAvailable(email);
  if (!emailAvailable) {
    const err = new Error('이미 사용 중인 이메일입니다.');
    err.status = 409;
    throw err;
  }

  const nicknameAvailable = await exports.isNicknameAvailable(nickname);
  if (!nicknameAvailable) {
    const err = new Error('이미 사용 중인 닉네임입니다.');
    err.status = 409;
    throw err;
  }

  // 3. 비밀번호 해시
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 4. users INSERT
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nickname)
     VALUES ($1, $2, $3)
     RETURNING user_id, email, nickname, created_at`,
    [email, passwordHash, nickname]
  );

  return rows[0];
};