const express = require('express');
const router = express.Router();
const CourseRepository = require('../repositories/courseRepository');
const RouteService = require('../services/routeService');

// ─────────────────────────────────────────────────────────────────────
//  Course Routes (Day 1) + Route API (Day 2)
// ─────────────────────────────────────────────────────────────────────

// ── Course CRUD ───────────────────────────────────────────────────────

// GET /api/courses
router.get('/', async (req, res) => {
  try {
    const courses = await CourseRepository.findAll();
    res.json({ success: true, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/courses/:id  (핀 목록 포함)
router.get('/:id', async (req, res) => {
  try {
    const course = await CourseRepository.findWithPins(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/courses
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name은 필수입니다.' });
    const course = await CourseRepository.create({ name, description });
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/courses/:id
router.put('/:id', async (req, res) => {
  try {
    const course = await CourseRepository.update(req.params.id, req.body);
    if (!course) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/courses/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await CourseRepository.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, message: '코스가 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Course ↔ Pin 연결 ─────────────────────────────────────────────────

// POST /api/courses/:id/pins  (핀 추가)
router.post('/:id/pins', async (req, res) => {
  try {
    const { pinId } = req.body;
    if (!pinId) return res.status(400).json({ success: false, message: 'pinId는 필수입니다.' });
    const cp = await CourseRepository.addPin(req.params.id, pinId);
    res.status(201).json({ success: true, data: cp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/courses/:id/pins/:pinId  (핀 제거)
router.delete('/:id/pins/:pinId', async (req, res) => {
  try {
    const deleted = await CourseRepository.removePin(req.params.id, req.params.pinId);
    if (!deleted) return res.status(404).json({ success: false, message: '연결된 핀을 찾을 수 없습니다.' });
    res.json({ success: true, message: '핀 연결이 제거되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Day 2: 경로 API ────────────────────────────────────────────────────

/**
 * POST /api/courses/:id/route/build
 * 코스의 핀 순서대로 네이버 도보 경로 자동 연결 + 세그먼트 저장
 *
 * Response:
 * {
 *   totalDistance: 3.2,    // km
 *   totalDuration: 2400,   // 초
 *   segments: [ { fromPinId, toPinId, distance, duration, coordinateCount }, ... ]
 * }
 */
router.post('/:id/route/build', async (req, res) => {
  try {
    const result = await RouteService.buildRouteForCourse(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/courses/:id/route/coordinates
 * 코스의 전체 경로 좌표 반환 (세그먼트 이어붙임)
 *
 * Response:
 * {
 *   coordinates: [ { lat, lng }, ... ],
 *   segments: [ { id, fromPinId, toPinId, distance, duration }, ... ]
 * }
 */
router.get('/:id/route/coordinates', async (req, res) => {
  try {
    const data = await RouteService.getFullRouteCoordinates(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/courses/:id/route/connect-pins
 * 특정 두 핀 간 경로 단일 연결
 * Body: { fromPinId, toPinId, orderIndex }
 */
router.post('/:id/route/connect-pins', async (req, res) => {
  try {
    const { fromPinId, toPinId, orderIndex } = req.body;
    if (!fromPinId || !toPinId) {
      return res.status(400).json({ success: false, message: 'fromPinId, toPinId는 필수입니다.' });
    }
    const segment = await RouteService.connectTwoPins(
      req.params.id,
      fromPinId,
      toPinId,
      orderIndex ?? 0
    );
    res.status(201).json({ success: true, data: segment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;