const express = require('express');
const router = express.Router({ mergeParams: true });
const NodeRepository = require('../repositories/nodeRepository');

// ─────────────────────────────────────────────────────────────────────
//  Spot Routes  (node_type = 'spot')
//  Base: /api/spots  또는  /api/courses/:courseId/spots
// ─────────────────────────────────────────────────────────────────────

// GET /api/spots  또는  GET /api/courses/:courseId/spots
// ?lat=&lng=&radius= 이면 반경 내 스팟 감지
// GET /api/spots/pins?lat=&lng=&radius=
router.get('/pins', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat, lng는 필수입니다.' });
    }

    const spots = await NodeRepository.findSpotsWithinRadius(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius) || 1
    );

    res.json({ success: true, data: spots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const { courseId } = req.params;

    if (lat && lng && radius) {
      const spots = await NodeRepository.findSpotsWithinRadius(
        parseFloat(lat), parseFloat(lng), parseFloat(radius)
      );
      return res.json({ success: true, data: spots });
    }

    if (courseId) {
      const spots = await NodeRepository.findByCourse(courseId, 'spot');
      return res.json({ success: true, data: spots });
    }

    const spots = await NodeRepository.findAllSpots();
    res.json({ success: true, data: spots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/spots/:nodeId
router.get('/:nodeId', async (req, res) => {
  try {
    const spot = await NodeRepository.findSpotById(req.params.nodeId);
    if (!spot) return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
    res.json({ success: true, data: spot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/spots
router.post('/', async (req, res) => {
  try {
    const { name, description, latitude, longitude, contentTypes, userId } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'name, latitude, longitude는 필수입니다.' });
    }
    const spot = await NodeRepository.createSpot({ name, description, latitude, longitude, contentTypes, userId });
    res.status(201).json({ success: true, data: spot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/spots/:nodeId
router.put('/:nodeId', async (req, res) => {
  try {
    const spot = await NodeRepository.updateSpot(req.params.nodeId, req.body);
    if (!spot) return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
    res.json({ success: true, data: spot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/spots/:nodeId
router.delete('/:nodeId', async (req, res) => {
  try {
    const deleted = await NodeRepository.deleteSpot(req.params.nodeId);
    if (!deleted) return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
    res.json({ success: true, message: '스팟이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;