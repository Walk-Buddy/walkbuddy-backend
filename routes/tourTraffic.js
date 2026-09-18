/**
 * routes/tourTraffic.js
 *
 * 공공데이터포털 OpenAPI 실시간 트래픽 로그 조회 (관리자 전용)
 *
 *   GET    /api/admin/tour-traffic            → 최근 로그 + 통계
 *   GET    /api/admin/tour-traffic/stats      → 누적 통계
 *   GET    /api/admin/tour-traffic/stream     → SSE 실시간 스트림
 *   DELETE /api/admin/tour-traffic            → 버퍼 비우기
 *
 * 예) curl -N -H "Authorization: Bearer <admin JWT>" \
 *        https://contest.gilbom.quest/api/admin/tour-traffic/stream
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const trafficLog = require('../services/tourTrafficLog');

// 관리자 인증 + 권한
router.use(authenticate, requireAdmin);

// 최근 로그 + 통계
router.get('/', (req, res) => {
  const { limit, api, pathname, status } = req.query;
  res.json({
    success: true,
    stats: trafficLog.stats(),
    logs: trafficLog.list({ limit, api, pathname, status }),
  });
});

// 누적 통계만
router.get('/stats', (req, res) => {
  res.json({ success: true, ...trafficLog.stats() });
});

// 실시간 스트림 (Server-Sent Events)
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx 프록시 버퍼링 비활성화
  });
  res.flushHeaders?.();

  // 연결 직후 통계 1회 전송
  res.write(`event: stats\ndata: ${JSON.stringify(trafficLog.stats())}\n\n`);

  const unsubscribe = trafficLog.subscribe((entry) => {
    res.write(`event: call\ndata: ${JSON.stringify(entry)}\n\n`);
  });

  // keep-alive (프록시 idle 타임아웃 방지)
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
});

// 버퍼 비우기
router.delete('/', (req, res) => {
  trafficLog.clear();
  res.json({ success: true, message: '트래픽 버퍼를 비웠습니다.' });
});

module.exports = router;
