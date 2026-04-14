const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────────────
//  JWT 인증 미들웨어
//  Authorization: Bearer <token> 헤더를 검증하고 req.userId 를 설정합니다.
// ─────────────────────────────────────────────────────────────────────

function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: '인증 토큰이 없습니다.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? '토큰이 만료되었습니다.'
      : '유효하지 않은 토큰입니다.';
    return res.status(401).json({ success: false, message });
  }
}

module.exports = auth;
