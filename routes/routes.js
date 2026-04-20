const express = require('express');
const router = express.Router();
const NodeRepository = require('../repositories/nodeRepository');
const RouteService = require('../services/routeService');
const { getWalkingRoute } = require('../services/osrmRouteService');
const { haversineKm } = require('../services/osrmRouteService');

// ─────────────────────────────────────────────────────────────────────
//  Route Routes  (코스 생성 - 수동)
//  Base: /api/routes
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/routes/calculate
 * 핀 좌표 배열 기반 도보 경로 및 거리 계산
 * Body: { pins: [{lat, lng}, ...] }
 * Response: { distance, estimatedMinutes, polyline: [{lat,lng},...] }
 */
router.post('/calculate', async (req, res) => {
  try {
    const { pins } = req.body;
     console.log('📌 받은 핀 좌표:', JSON.stringify(pins, null, 2));
    if (!Array.isArray(pins) || pins.length < 2) {
      return res.status(400).json({ success: false, message: '핀이 2개 이상 필요합니다.' });
    }

    let totalDistance = 0;
    const polyline = [];

    for (let i = 0; i < pins.length - 1; i++) {
      const from = pins[i];
      const to = pins[i + 1];

      const routeData = await getWalkingRoute(from.lat, from.lng, to.lat, to.lng);
      totalDistance += routeData.distance;

      const coords = routeData.coordinates;
      const slice = polyline.length > 0 ? coords.slice(1) : coords;
      polyline.push(...slice);
    }

    const distance = Math.round(totalDistance * 100) / 100;
    const estimatedMinutes = Math.round((distance / 4) * 60);

    res.json({ success: true, data: { distance, estimatedMinutes, polyline } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/routes/detect-spots
 * 경로 폴리라인 기반 주변 스팟 자동 감지
 * Body: { polyline: [{lat, lng}, ...], radiusKm: 0.05 }
 * Response: [{ spotId, name, lat, lng, dist }, ...]
 */
router.post('/detect-spots', async (req, res) => {
  try {
    const { polyline, radiusKm = 0.05 } = req.body;
    if (!Array.isArray(polyline) || !polyline.length) {
      return res.status(400).json({ success: false, message: 'polyline은 필수입니다.' });
    }

    // 폴리라인 대표 좌표(중심점) 기준으로 스팟 감지
    const centerLat = polyline.reduce((s, c) => s + c.lat, 0) / polyline.length;
    const centerLng = polyline.reduce((s, c) => s + c.lng, 0) / polyline.length;

    // 경로 전체를 커버하는 반경으로 확장 (경로 끝점까지 거리 + radiusKm)
    const maxDist = Math.max(
      ...polyline.map(c => haversineKm(centerLat, centerLng, c.lat, c.lng))
    ) + radiusKm;

    const allSpots = await NodeRepository.findSpotsWithinRadius(centerLat, centerLng, maxDist);

    // 각 스팟과 경로 상 가장 가까운 점 사이 거리 필터링
    const detected = allSpots
      .map(spot => {
        const minDist = Math.min(
          ...polyline.map(c => haversineKm(spot.latitude, spot.longitude, c.lat, c.lng))
        );
        return { ...spot, dist: Math.round(minDist * 1000) }; // m 단위
      })
      .filter(s => s.dist <= radiusKm * 1000)
      .sort((a, b) => a.dist - b.dist);

    res.json({ success: true, data: detected });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;