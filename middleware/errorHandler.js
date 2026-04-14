function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || '서버 오류가 발생했습니다.';
  res.status(status).json({ success: false, message });
}

module.exports = errorHandler;
