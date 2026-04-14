const PinRepository = require('../repositories/pinRepository');
const CourseRepository = require('../repositories/courseRepository');
const RouteSegmentRepository = require('../repositories/routeSegmentRepository');
const { getWalkingRoute } = require('./osrmRouteService');

// ─────────────────────────────────────────────────────────────────────
//  Route Service
//  Day 2: 핀 간 경로 자동 연결 + 경로 좌표 반환
// ─────────────────────────────────────────────────────────────────────

const RouteService = {

  /**
   * 코스의 핀 순서대로 OSRM 도보 경로 API 호출 → 모든 세그먼트 저장
   * @param {number} courseId
   * @returns {{ segments: Array, totalDistance: number, totalDuration: number }}
   */
  async buildRouteForCourse(courseId) {
    const course = await CourseRepository.findWithPins(courseId);
    if (!course) throw new Error(`코스 ID ${courseId}를 찾을 수 없습니다.`);

    const pins = course.pins;
    if (pins.length < 2) {
      throw new Error('경로 생성을 위해 핀이 2개 이상 필요합니다.');
    }

    // 기존 세그먼트 삭제 후 재생성
    await RouteSegmentRepository.deleteByCourse(courseId);

    const segments = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < pins.length - 1; i++) {
      const from = pins[i];
      const to = pins[i + 1];

      console.log(`🗺  경로 계산 중: ${from.name} → ${to.name}`);

      const routeData = await getWalkingRoute(
        from.latitude, from.longitude,
        to.latitude, to.longitude
      );

      const segment = await RouteSegmentRepository.upsert({
        courseId,
        fromPinId: from.id,
        toPinId: to.id,
        orderIndex: i,
        coordinates: routeData.coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
      });

      segments.push(segment);
      totalDistance += routeData.distance;
      totalDuration += routeData.duration;
    }

    return {
      segments,
      totalDistance: Math.round(totalDistance * 100) / 100, // km, 소수점 2자리
      totalDuration: Math.round(totalDuration),              // 초
    };
  },

  /**
   * 두 핀 간 단일 경로 연결 (핀 추가 시 개별 호출용)
   */
  async connectTwoPins(courseId, fromPinId, toPinId, orderIndex) {
    const [from, to] = await Promise.all([
      PinRepository.findById(fromPinId),
      PinRepository.findById(toPinId),
    ]);
    if (!from || !to) throw new Error('핀을 찾을 수 없습니다.');

    const routeData = await getWalkingRoute(
      from.latitude, from.longitude,
      to.latitude, to.longitude
    );

    return RouteSegmentRepository.upsert({
      courseId,
      fromPinId,
      toPinId,
      orderIndex,
      ...routeData,
    });
  },

  /**
   * 코스의 전체 경로 좌표 반환 (세그먼트 이어붙이기)
   * @returns {{ coordinates: Array<{lat,lng}>, segments: Array }}
   */
  async getFullRouteCoordinates(courseId) {
    const segments = await RouteSegmentRepository.findByCourse(courseId);
    if (!segments.length) {
      throw new Error('저장된 경로가 없습니다. 먼저 경로를 생성하세요.');
    }

    const coordinates = [];
    for (const seg of segments) {
      const coords = Array.isArray(seg.coordinates) ? seg.coordinates : [];
      // 세그먼트 이음새 중복 제거: 첫 세그먼트는 전부, 이후엔 첫 좌표 제외
      const slice = coordinates.length > 0 ? coords.slice(1) : coords;
      coordinates.push(...slice);
    }

    return {
      coordinates,
      segments: segments.map((s) => ({
        id: s.id,
        fromPinId: s.from_pin_id,
        toPinId: s.to_pin_id,
        orderIndex: s.order_index,
        distance: s.distance,
        duration: s.duration,
        coordinateCount: Array.isArray(s.coordinates) ? s.coordinates.length : 0,
      })),
    };
  },
};

module.exports = RouteService;