const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

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

// ── 로그인 관련 (로그인 담당자가 채울 영역) ──────────────────────────
// POST /api/auth/login
// POST /api/auth/login/kakao
// POST /api/auth/logout
// POST /api/auth/token/refresh
// POST /api/auth/password/reset

module.exports = router;