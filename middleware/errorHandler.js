// ──────────────────────────────────────────────────────────────────────
// 전역 에러 핸들러
// 서비스/컨트롤러에서 next(err) 로 넘어온 에러를 여기서 처리
// err.status 가 있으면 그 코드 사용, 없으면 500
// ──────────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || '서버 오류가 발생했습니다.';
 
  if (status === 500) {
    console.error('[Server Error]', err);
  }
 
  res.status(status).json({ success: false, message });
};