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

// POST /api/courses
router.post('/', async (req, res) => {
  try {
    const { title, description, creationType, userId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title은 필수입니다.' });
    const course = await CourseRepository.create({ title, description, creationType, userId });
    res.status(201).json({ success: true, data: course });
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

// ── Route API ─────────────────────────────────────────────────────────

// POST /api/courses/:courseId/route/build
router.post('/:courseId/route/build', async (req, res) => {
  try {
    const result = await RouteService.buildRouteForCourse(req.params.courseId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/courses/:courseId/route/coordinates
router.get('/:courseId/route/coordinates', async (req, res) => {
  try {
    const data = await RouteService.getFullRouteCoordinates(req.params.courseId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/courses/:courseId/route/connect-pins
router.post('/:courseId/route/connect-pins', async (req, res) => {
  try {
    const { fromNodeId, toNodeId, orderIndex } = req.body;
    if (!fromNodeId || !toNodeId) {
      return res.status(400).json({ success: false, message: 'fromNodeId, toNodeId는 필수입니다.' });
    }
    const segment = await RouteService.connectTwoNodes(
      req.params.courseId, fromNodeId, toNodeId, orderIndex ?? 0
    );
    res.status(201).json({ success: true, data: segment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;