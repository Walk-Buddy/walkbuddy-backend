const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────
//  OSRM 도보 경로 서비스 (완전 무료, API 키 불필요)
//  공개 서버: router.project-osrm.org
//  Day 2: 도보 경로 API 연동 완성
// ─────────────────────────────────────────────────────────────────────

const OSRM_URL = 'https://router.project-osrm.org/route/v1/foot';

/**
 * OSRM 도보 경로 API 호출
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @returns {{ coordinates: Array<{lat,lng}>, distance: number, duration: number }}
 */
async function getWalkingRoute(startLat, startLng, endLat, endLng) {
  try {
    const response = await axios.get(
      `${OSRM_URL}/${startLng},${startLat};${endLng},${endLat}`,
      {
        params: {
          overview: 'full',      // 전체 경로 좌표 반환
          geometries: 'geojson', // GeoJSON 형식으로 받기
          steps: false,
        },
        timeout: 8000,
      }
    );

    const route = response.data?.routes?.[0];
    if (!route) throw new Error('OSRM에서 경로를 찾을 수 없습니다.');

    // GeoJSON coordinates: [[lng, lat], ...]  → {lat, lng}
    const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    return {
      coordinates,
      distance: route.distance / 1000,  // m → km
      duration: route.duration,          // 초
    };
  } catch (err) {
    // OSRM 서버 장애 시 fallback: 직선 경로
    console.warn('⚠️  OSRM 호출 실패 → fallback 직선 경로 사용:', err.message);
    return getFallbackRoute(startLat, startLng, endLat, endLng);
  }
}

/**
 * 직선 거리 계산 (Haversine)
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * OSRM 장애 시 fallback: 직선 경로
 */
function getFallbackRoute(startLat, startLng, endLat, endLng) {
  const steps = 5;
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    coordinates.push({
      lat: startLat + ((endLat - startLat) * i) / steps,
      lng: startLng + ((endLng - startLng) * i) / steps,
    });
  }
  const distance = haversineKm(startLat, startLng, endLat, endLng);
  const duration = Math.round((distance / 4) * 3600); // 평균 도보 4km/h → 초

  return { coordinates, distance, duration };
}

module.exports = { getWalkingRoute, haversineKm };