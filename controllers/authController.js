const authService = require('../services/authService');

// ──────────────────────────────────────────────────────────────────────
// GET /api/auth/check-email?email=
// 이메일 중복 확인
// ──────────────────────────────────────────────────────────────────────
exports.checkEmail = async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
    }

    // 이메일 형식 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });
    }

    const available = await authService.isEmailAvailable(email);
    return res.status(200).json({ available });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/auth/check-nickname?nickname=
// 닉네임 중복 확인
// ──────────────────────────────────────────────────────────────────────
exports.checkNickname = async (req, res, next) => {
  try {
    const { nickname } = req.query;

    if (!nickname) {
      return res.status(400).json({ success: false, message: '닉네임을 입력해주세요.' });
    }

    // 닉네임 길이 검사 (2~12자)
    if (nickname.length < 2 || nickname.length > 12) {
      return res.status(400).json({ success: false, message: '닉네임은 2~12자여야 합니다.' });
    }

    const available = await authService.isNicknameAvailable(nickname);
    return res.status(200).json({ available });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/email/verify/send
// 이메일 인증코드 발송
// body: { email }
// ──────────────────────────────────────────────────────────────────────
exports.sendVerifyCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });
    }

    // 이미 가입된 이메일인지 사전 체크
    const available = await authService.isEmailAvailable(email);
    if (!available) {
      return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
    }

    const result = await authService.sendVerifyCode(email);
    return res.status(200).json({
      message: '인증코드가 발송되었습니다.',
      expires_in: result.expiresIn, // 초 단위 (180)
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/email/verify/confirm
// 인증코드 검증 → 성공 시 verify_token 반환 (회원가입 완료 시 사용)
// body: { email, code }
// ──────────────────────────────────────────────────────────────────────
exports.confirmVerifyCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: '이메일과 인증코드를 모두 입력해주세요.' });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: '인증코드는 6자리 숫자입니다.' });
    }

    // verify_token: 인증 완료 증명용 단기 JWT (회원가입 완료 단계에서 검증)
    const verifyToken = await authService.confirmVerifyCode(email, code);
    return res.status(200).json({
      verified: true,
      verify_token: verifyToken, // 클라이언트가 register 요청에 포함해야 함
    });
  } catch (err) {
    // 코드 불일치 / 만료는 서비스에서 throw → errorHandler가 처리
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// 회원가입 최종 완료
// body: { email, password, nickname, verify_token }
// ──────────────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { email, password, nickname, verify_token } = req.body;

    // ── 필드 존재 여부 ──────────────────────────────────────────────
    if (!email || !password || !nickname || !verify_token) {
      return res.status(400).json({
        success: false,
        message: '이메일, 비밀번호, 닉네임, 인증 토큰은 필수입니다.',
      });
    }

    // ── 이메일 형식 ────────────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });
    }

    // ── 비밀번호 정책: 영문+숫자+특수문자 8~20자 ───────────────────
    const pwRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;
    if (!pwRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: '비밀번호는 영문, 숫자, 특수문자를 포함한 8~20자여야 합니다.',
      });
    }

    // ── 닉네임 길이 ────────────────────────────────────────────────
    if (nickname.length < 2 || nickname.length > 12) {
      return res.status(400).json({ success: false, message: '닉네임은 2~12자여야 합니다.' });
    }

    const user = await authService.register({ email, password, nickname, verifyToken: verify_token });

    return res.status(201).json({
      user_id: user.user_id,
      email: user.email,
      nickname: user.nickname,
      created_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// 일반 로그인 (이메일/비밀번호 + 자동 로그인)
// body: { email, password, auto_login }
// ──────────────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password, auto_login = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
    }

    const result = await authService.login({ email, password, auto_login });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/login/kakao
// 카카오 소셜 로그인
// body: { code }
// ──────────────────────────────────────────────────────────────────────
exports.kakaoLogin = async (req, res, next) => {
  try {
    const code = req.body.code || req.query.code;

    if (!code) {
      return res.status(400).json({ success: false, message: '카카오 인가코드가 없습니다.' });
    }

    const result = await authService.kakaoLogin(code);
    const { access_token, refresh_token } = result;
return res.redirect(`walkbuddy://login-success?access_token=${access_token}&refresh_token=${refresh_token}`);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/password/reset
// 비밀번호 찾기 (임시 비밀번호 이메일 발송)
// body: { email }
// ──────────────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
    }

    await authService.resetPassword(email);
    return res.status(200).json({ success: true, message: '임시 비밀번호가 이메일로 발송되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/token/refresh
// 액세스 토큰 재발급
// body: { refresh_token }
// ──────────────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ success: false, message: 'refresh_token이 없습니다.' });
    }

    const result = await authService.refreshToken(refresh_token);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// 로그아웃
// ──────────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    // req.user는 인증(authenticate) 미들웨어에서 주입된다고 가정합니다.
    await authService.logout(req.user.user_id);
    return res.status(200).json({ success: true, message: '로그아웃 되었습니다.' });
  } catch (err) {
    next(err);
  }
};