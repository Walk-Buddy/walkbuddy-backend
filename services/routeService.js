const NodeRepository = require('../repositories/nodeRepository');
const CourseRepository = require('../repositories/courseRepository');
const RouteSegmentRepository = require('../repositories/routeSegmentRepository');
const { getWalkingRoute } = require('./osrmRouteService');
const CourseCalculator = require('./courseCalculator');

// ─────────────────────────────────────────────────────────────────────
//  Route Service
//  Day 2: 핀 간 경로 자동 연결 + 경로 좌표 반환
//  Day 3: 경로 생성 완료 후 코스 정보 자동 계산 및 저장
// ─────────────────────────────────────────────────────────────────────

const RouteService = {

  /**
   * 코스의 핀 순서대로 OSRM 도보 경로 API 호출 → 세그먼트 저장
   * → 총 거리 / 예상 소요시간 / 난이도 자동 계산 (Day 3)
   */
  async buildRouteForCourse(courseId) {
    const course = await CourseRepository.findWithPins(courseId);
    if (!course) throw new Error(`코스 ID ${courseId}를 찾을 수 없습니다.`);

    const pins = course.pins;
    if (pins.length < 2) throw new Error('경로 생성을 위해 핀이 2개 이상 필요합니다.');

    await RouteSegmentRepository.deleteByCourse(courseId);

    const segments = [];

    for (let i = 0; i < pins.length - 1; i++) {
      const from = pins[i];
      const to = pins[i + 1];

      console.log(`🗺  경로 계산 중: pin ${from.node_id} → ${to.node_id}`);

      const routeData = await getWalkingRoute(
        from.latitude, from.longitude,
        to.latitude, to.longitude
      );

      const segment = await RouteSegmentRepository.upsert({
        courseId,
        fromNodeId: from.node_id,
        toNodeId: to.node_id,
        orderIndex: i,
        coordinates: routeData.coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
      });

      segments.push(segment);
    }

    // Day 3: 코스 정보 자동 계산 및 업데이트
    const { totalDistanceKm, estimatedMinutes, difficulty } = CourseCalculator.calcAll(segments);
    await CourseRepository.update(courseId, {
      total_distance_km: totalDistanceKm,
      estimated_minutes: estimatedMinutes,
      difficulty,
    });

    const totalDuration = segments.reduce((sum, s) => sum + (s.duration || 0), 0);

    return {
      segments,
      totalDistanceKm,
      totalDuration: Math.round(totalDuration), // 초
      estimatedMinutes,                          // 분
      difficulty,
    };
  },

  /**
   * 두 노드(핀) 간 단일 경로 연결
   */
  async connectTwoNodes(courseId, fromNodeId, toNodeId, orderIndex) {
    const [from, to] = await Promise.all([
      NodeRepository.findPinById(fromNodeId),
      NodeRepository.findPinById(toNodeId),
    ]);
    if (!from || !to) throw new Error('핀을 찾을 수 없습니다.');

    const routeData = await getWalkingRoute(
      from.latitude, from.longitude,
      to.latitude, to.longitude
    );

    return RouteSegmentRepository.upsert({
      courseId,
      fromNodeId,
      toNodeId,
      orderIndex,
      ...routeData,
    });
  },

  /**
   * 코스의 전체 경로 좌표 반환 (세그먼트 이어붙이기)
   */
  async getFullRouteCoordinates(courseId) {
    const segments = await RouteSegmentRepository.findByCourse(courseId);
    if (!segments.length) {
      throw new Error('저장된 경로가 없습니다. 먼저 경로를 생성하세요.');
    }

    const coordinates = [];
    for (const seg of segments) {
      const coords = Array.isArray(seg.coordinates) ? seg.coordinates : [];
      const slice = coordinates.length > 0 ? coords.slice(1) : coords;
      coordinates.push(...slice);
    }

    return {
      coordinates,
      segments: segments.map((s) => ({
        id: s.id,
        fromNodeId: s.from_node_id,
        toNodeId: s.to_node_id,
        orderIndex: s.order_index,
        distance: s.distance,
        duration: s.duration,
        coordinateCount: Array.isArray(s.coordinates) ? s.coordinates.length : 0,
      })),
    };
  },
};

module.exports = RouteService;