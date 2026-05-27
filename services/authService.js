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

 // ──────────────────────────────────────────────────────────────────────
// 일반 로그인
// 사용자 조회 → 비밀번호 비교 → 계정 상태 확인 → JWT 발급
// ──────────────────────────────────────────────────────────────────────
exports.login = async ({ email, password, auto_login }) => {
  // 1. 사용자 조회 (소셜 가입자는 일반 로그인 불가능하도록 구분 처리)
  const { rows } = await pool.query(
    `SELECT user_id, email, nickname, password_hash, role, status
     FROM users
     WHERE email = $1 AND social_provider IS NULL`,
    [email]
  );

  const user = rows[0];

  // 2. 사용자 없음 or 비밀번호 불일치 (보안상 에러 메시지 통일)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw Object.assign(new Error('이메일 또는 비밀번호가 올바르지 않습니다.'), { status: 401 });
  }

  // 3. 계정 상태 확인
  if (user.status === 'suspended') {
    throw Object.assign(new Error('정지된 계정입니다. 고객센터에 문의해주세요.'), { status: 403 });
  }
  if (user.status === 'deleted') {
    throw Object.assign(new Error('탈퇴한 계정입니다.'), { status: 403 });
  }

  // 4. 토큰 발급
  const { access_token, refresh_token } = issueTokens(
    { user_id: user.user_id, role: user.role },
    auto_login
  );

  return {
    access_token,
    refresh_token,
    user: {
      user_id: user.user_id,
      nickname: user.nickname,
      role: user.role,
    },
  };
};

// ──────────────────────────────────────────────────────────────────────
// 카카오 소셜 로그인
// 토큰 교환 → 사용자 정보 조회 → 신규 가입/로그인 처리 → JWT 발급
// ──────────────────────────────────────────────────────────────────────
exports.kakaoLogin = async (code) => {
  // ── Step 1: 인가코드로 카카오 액세스 토큰 교환 ──
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    process.env.KAKAO_REST_API_KEY,
      redirect_uri: process.env.KAKAO_REDIRECT_URI,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw Object.assign(
      ...[new Error(`카카오 토큰 교환 실패: ${tokenData.error_description}`)],
      { status: 400 }
    );
  }

  const kakaoAccessToken = tokenData.access_token;

  // ── Step 2: 카카오 사용자 정보 조회 ──
  const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${kakaoAccessToken}` },
  });

  const kakaoUser = await userRes.json();
  if (!kakaoUser.id) {
    throw Object.assign(new Error('카카오 사용자 정보 조회 실패'), { status: 400 });
  }

  const social_id       = String(kakaoUser.id);
  const kakaoEmail      = kakaoUser.kakao_account?.email ?? null;       // 이메일 미동의 시 null
  const kakaoNickname   = kakaoUser.kakao_account?.profile?.nickname;
  const kakaoProfileImg = kakaoUser.kakao_account?.profile?.profile_image_url ?? null;

  // ── Step 3: DB에서 기존 유저 조회 ──
  const { rows } = await pool.query(
    `SELECT user_id, nickname, role, status
     FROM users
     WHERE social_provider = 'kakao' AND social_id = $1`,
    [social_id]
  );

  let user;
  let is_new_user = false;

  if (rows.length > 0) {
    // 기존 유저: 로그인 처리
    user = rows[0];

    if (user.status === 'suspended') {
      throw Object.assign(new Error('정지된 계정입니다.'), { status: 403 });
    }
    if (user.status === 'deleted') {
      throw Object.assign(new Error('탈퇴한 계정입니다.'), { status: 403 });
    }
  } else {
    // 신규 유저: 자동 회원가입
    is_new_user = true;

    // 닉네임 설정 및 중복 시 랜덤 suffix 부여
    let nickname = kakaoNickname ?? '카카오유저';
    if (nickname.length > 12) nickname = nickname.slice(0, 12);
    const nicknameAvailable = await exports.isNicknameAvailable(nickname);
    if (!nicknameAvailable) {
      nickname = nickname.slice(0, 9) + Math.floor(Math.random() * 1000);
    }

    const { rows: newRows } = await pool.query(
      `INSERT INTO users (email, nickname, profile_image_url, social_provider, social_id)
       VALUES ($1, $2, $3, 'kakao', $4)
       RETURNING user_id, nickname, role`,
      [kakaoEmail, nickname, kakaoProfileImg, social_id]
    );

    user = newRows[0];
  }

  // ── Step 4: JWT 발급 ──
  const { access_token, refresh_token } = issueTokens({
    user_id: user.user_id,
    role: user.role,
  });

  return {
    access_token,
    refresh_token,
    is_new_user,
    user: {
      user_id:  user.user_id,
      email:    kakaoEmail,
      nickname: user.nickname,
    },
  };
};

// ──────────────────────────────────────────────────────────────────────
// 비밀번호 찾기: 임시 비밀번호 발송
// ──────────────────────────────────────────────────────────────────────
exports.resetPassword = async (email) => {
  const { rows } = await pool.query(
    'SELECT user_id FROM users WHERE email = $1 AND social_provider IS NULL',
    [email]
  );
  if (rows.length === 0) {
    return; // 보안상 계정 존재 여부를 숨기기 위해 바로 리턴
  }

  const tempPassword = crypto.randomBytes(5).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE user_id = $2',
    [passwordHash, rows[0].user_id]
  );

  await emailUtil.sendEmail({
    to: email,
    subject: '[SWUAZA] 임시 비밀번호 안내',
    text: `임시 비밀번호: ${tempPassword}\n\n로그인 후 반드시 비밀번호를 변경해주세요.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: auto;">
        <h2>임시 비밀번호 안내</h2>
        <p>아래 임시 비밀번호로 로그인 후 <strong>반드시 비밀번호를 변경</strong>해주세요.</p>
        <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #333; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${tempPassword}
        </div>
      </div>
    `,
  });
};

// ──────────────────────────────────────────────────────────────────────
// 액세스 토큰 재발급
// ──────────────────────────────────────────────────────────────────────
exports.refreshToken = async (refresh_token) => {
  let payload;
  try {
    payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw Object.assign(new Error('유효하지 않거나 만료된 refresh_token입니다.'), { status: 401 });
  }

  const { rows } = await pool.query(
    'SELECT user_id, role, status FROM users WHERE user_id = $1',
    [payload.user_id]
  );
  const user = rows[0]; };
  if (!user || user.status !== 'active') {
    throw Object.assign(new Error('사용할 수 없는 계정입니다.'), { status: 403 });
  }

  const access_token = jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );

  return { access_token };
};

// ──────────────────────────────────────────────────────────────────────
// 로그아웃
// ──────────────────────────────────────────────────────────────────────
exports.logout = async (user_id) => {
  return true;
};
