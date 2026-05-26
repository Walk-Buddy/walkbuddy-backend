const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// ── 회원가입 ──────────────────────────────────────────────────────────
// GET  /api/auth/check-email?email=   → 이메일 중복 확인
router.get('/check-email', authController.checkEmail);

// GET  /api/auth/check-nickname?nickname=  → 닉네임 중복 확인
router.get('/check-nickname', authController.checkNickname);

// POST /api/auth/email/verify/send    → 인증코드 이메일 발송
router.post('/email/verify/send', authController.sendVerifyCode);

// POST /api/auth/email/verify/confirm → 인증코드 검증
router.post('/email/verify/confirm', authController.confirmVerifyCode);

// POST /api/auth/register             → 회원가입 최종 완료
router.post('/register', authController.register);

// ── 로그인 ────────────────────────────────────────────────────────────
// POST /api/auth/login                → 일반 로그인 (이메일/비밀번호 + 자동 로그인)
router.post('/login', authController.login);

// POST /api/auth/login/kakao          → 카카오 소셜 로그인 (인가코드로 토큰 교환 및 JWT 발급)
router.post('/login/kakao', authController.kakaoLogin);

// ── 기타 인증 ─────────────────────────────────────────────────────────
// POST /api/auth/password/reset       → 비밀번호 찾기 (임시 비밀번호 이메일 발송)
router.post('/password/reset', authController.resetPassword);

// POST /api/auth/token/refresh        → 액세스 토큰 재발급 (Refresh Token 검증)
router.post('/token/refresh', authController.refreshToken);

// POST /api/auth/logout               → 로그아웃 (인증 미들웨어 필요)
router.post('/logout', authenticate, authController.logout);

module.exports = router;