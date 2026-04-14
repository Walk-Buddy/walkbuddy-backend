const express = require('express');
const router = express.Router();
const CourseRepository = require('../repositories/courseRepository');
const RouteService = require('../services/routeService');

// ─────────────────────────────────────────────────────────────────────
//  Course Routes
//  Base: /api/courses
// ─────────────────────────────────────────────────────────────────────

// GET /api/courses
router.get('/', async (req, res) => {
  try {
    const courses = await CourseRepository.findAll();
    res.json({ success: true, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/courses/:courseId
router.get('/:courseId', async (req, res) => {
  try {
    const course = await CourseRepository.findWithPins(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/courses/manual
 * 수동 핀 경로 + 스팟 포함 코스 등록
 * Body: { title, description, userId, pins: [nodeId,...], spots: [nodeId,...] }
 */
router.post('/manual', async (req, res) => {
  try {
    const { title, description, userId, pins = [], spots = [] } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title은 필수입니다.' });
    if (pins.length < 2) return res.status(400).json({ success: false, message: '핀이 2개 이상 필요합니다.' });

    // 코스 생성
    const course = await CourseRepository.create({ title, description, creationType: 'manual', userId });

    // 핀 순서대로 연결
    for (const nodeId of pins) {
      await CourseRepository.addPin(course.course_id, nodeId);
    }

    // 스팟 연결
    for (const nodeId of spots) {
      await CourseRepository.addPin(course.course_id, nodeId);
    }

    // 경로 자동 계산 + 코스 정보 업데이트 (거리/시간/난이도)
    const routeResult = await RouteService.buildRouteForCourse(course.course_id);

    res.status(201).json({ success: true, data: { courseId: course.course_id, ...routeResult } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/courses/:courseId
router.put('/:courseId', async (req, res) => {
  try {
    const course = await CourseRepository.update(req.params.courseId, req.body);
    if (!course) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/courses/:courseId
router.delete('/:courseId', async (req, res) => {
  try {
    const deleted = await CourseRepository.delete(req.params.courseId);
    if (!deleted) return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    res.json({ success: true, message: '코스가 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Course ↔ Pin 연결 ─────────────────────────────────────────────────

// POST /api/courses/:courseId/pins
router.post('/:courseId/pins', async (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) return res.status(400).json({ success: false, message: 'nodeId는 필수입니다.' });
    const cp = await CourseRepository.addPin(req.params.courseId, nodeId);
    res.status(201).json({ success: true, data: cp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/courses/:courseId/pins/:nodeId
router.delete('/:courseId/pins/:nodeId', async (req, res) => {
  try {
    const deleted = await CourseRepository.removePin(req.params.courseId, req.params.nodeId);
    if (!deleted) return res.status(404).json({ success: false, message: '연결된 핀을 찾을 수 없습니다.' });
    res.json({ success: true, message: '핀 연결이 제거되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;