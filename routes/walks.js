const express = require('express');
const router = express.Router();
const RecordingRepository = require('../repositories/recordingRepository');
const CourseRepository = require('../repositories/courseRepository');
const NodeRepository = require('../repositories/nodeRepository');
const CourseCalculator = require('../services/courseCalculator');

// ─────────────────────────────────────────────────────────────────────
//  Walks Routes  (코스 생성 - 자동 / GPS 기록)
//  Base: /api/walks
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/walks/tracking/start
 * GPS 경로 기록 세션 생성
 * Body: { userId }
 * Response: { trackingId }
 */
router.post('/tracking/start', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId는 필수입니다.' });
    const recording = await RecordingRepository.start(userId);
    res.status(201).json({ success: true, data: { trackingId: recording.activity_record_id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/walks/tracking/:id/loc
 * 실시간 GPS 좌표 업로드 (주기적 전송)
 * Body: { coordinates: [{lat, lng}, ...] }
 * Response: { currentDist }
 */
router.post('/tracking/:id/loc', async (req, res) => {
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
    res.json({ success: true, data: { currentDist: updated?.actual_distance_km ?? 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/walks/tracking/:id/spots
 * 이동 중 스팟 즉시 등록
 * Body: { name, description, latitude, longitude, contentTypes, userId }
 * Response: { spotId }
 */
router.post('/tracking/:id/spots', async (req, res) => {
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
    res.status(201).json({ success: true, data: { spotId: spot.node_id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/walks/tracking/:id/stop
 * GPS 경로 기록 종료 및 코스 저장
 * Body: { title, description, userId }
 * Response: { courseId }
 */
router.post('/tracking/:id/stop', async (req, res) => {
  try {
    const { title, description, userId } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title은 필수입니다.' });

    const recording = await RecordingRepository.finish(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: '진행 중인 기록을 찾을 수 없습니다.' });
    }

    // 코스 자동 생성
    const course = await CourseRepository.create({
      title,
      description,
      creationType: 'auto',
      userId,
    });

    // 기록에 코스 연결
    await RecordingRepository.linkCourse(req.params.id, course.course_id);

    res.status(201).json({ success: true, data: { courseId: course.course_id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;