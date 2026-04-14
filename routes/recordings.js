const express = require('express');
const router = express.Router();
const RecordingRepository = require('../repositories/recordingRepository');
const CourseRepository = require('../repositories/courseRepository');
const NodeRepository = require('../repositories/nodeRepository');

// ─────────────────────────────────────────────────────────────────────
//  Recording Routes  (Day 5-6)
//  Base: /api/recordings
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/recordings/start
 * GPS 기록 시작
 * Body: { userId }
 */
router.post('/start', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId는 필수입니다.' });
    const recording = await RecordingRepository.start(userId);
    res.status(201).json({ success: true, data: recording });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/stop
 * GPS 기록 종료
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const recording = await RecordingRepository.finish(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: '진행 중인 기록을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: recording });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/pause
 * 기록 일시정지
 */
router.post('/:id/pause', async (req, res) => {
  try {
    const recording = await RecordingRepository.pause(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: '진행 중인 기록을 찾을 수 없습니다.' });
    res.json({ success: true, data: recording });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/resume
 * 기록 재개
 */
router.post('/:id/resume', async (req, res) => {
  try {
    const recording = await RecordingRepository.resume(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: '일시정지된 기록을 찾을 수 없습니다.' });
    res.json({ success: true, data: recording });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/coordinates
 * GPS 좌표 누적 저장 (기록 중 주기적으로 호출)
 * Body: { coordinates: [{lat, lng}, ...] }
 */
router.post('/:id/coordinates', async (req, res) => {
  try {
    const { coordinates } = req.body;
    if (!Array.isArray(coordinates) || !coordinates.length) {
      return res.status(400).json({ success: false, message: 'coordinates 배열은 필수입니다.' });
    }

    const recording = await RecordingRepository.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: '기록을 찾을 수 없습니다.' });
    if (recording.status === 'completed') {
      return res.status(400).json({ success: false, message: '이미 종료된 기록입니다.' });
    }

    const updated = await RecordingRepository.updateActualRoute(req.params.id, coordinates);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/spots
 * 기록 중 스팟 즉시 등록 (Day 6)
 * Body: { name, description, latitude, longitude, contentTypes, userId }
 */
router.post('/:id/spots', async (req, res) => {
  try {
    const { name, description, latitude, longitude, contentTypes, userId } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'name, latitude, longitude는 필수입니다.' });
    }

    const recording = await RecordingRepository.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: '기록을 찾을 수 없습니다.' });
    if (recording.status === 'completed') {
      return res.status(400).json({ success: false, message: '이미 종료된 기록입니다.' });
    }

    const spot = await NodeRepository.createSpot({ name, description, latitude, longitude, contentTypes, userId });
    res.status(201).json({ success: true, data: spot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/recordings/:id/save-as-course
 * 기록 완료 후 코스 저장 (Day 6)
 * Body: { title, description, userId }
 */
router.post('/:id/save-as-course', async (req, res) => {
  try {
    const { title, description, userId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title은 필수입니다.' });

    const recording = await RecordingRepository.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: '기록을 찾을 수 없습니다.' });
    if (recording.status !== 'completed') {
      return res.status(400).json({ success: false, message: '기록을 먼저 종료해주세요.' });
    }

    // 코스 생성 (creation_type: 'auto')
    const course = await CourseRepository.create({ title, description, creationType: 'auto', userId });

    // 기록에 코스 연결
    await RecordingRepository.linkCourse(req.params.id, course.course_id);

    res.status(201).json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;