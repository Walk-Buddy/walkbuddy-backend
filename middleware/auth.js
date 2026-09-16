const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────────────
// JWT 인증 미들웨어
// Authorization: Bearer <token> 헤더를 검증하고 req.user를 설정합니다.
// ─────────────────────────────────────────────────────────────────────
exports.authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '인증 토큰이 없습니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // 이전에 작성된 서비스 및 컨트롤러 규격에 맞추어 user_id와 role 주입
    req.user = { 
      user_id: payload.user_id, 
      role: payload.role 
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: '토큰이 만료되었습니다.', 
        code: 'TOKEN_EXPIRED' 
      });
    }
    return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// 선택적 JWT 인증 미들웨어 (Optional Auth)
// 토큰이 있으면 req.user에 주입하고, 없거나 유효하지 않아도 통과시킵니다.
// ─────────────────────────────────────────────────────────────────────
exports.optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      user_id: payload.user_id,
      role: payload.role
    };
  } catch (err) {
    req.user = null;
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────
// 관리자 권한 필수 미들웨어
// authenticate 미들웨어 이후에 사용하며 관리자 권한을 체크합니다.
// ─────────────────────────────────────────────────────────────────────
exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
};