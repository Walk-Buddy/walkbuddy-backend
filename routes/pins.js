const express = require('express');
const router = express.Router();
const PinRepository = require('../repositories/pinRepository');

// ─────────────────────────────────────────────────────────────────────
//  Pin CRUD Routes  (Day 1)
// ─────────────────────────────────────────────────────────────────────

// GET /api/pins
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    // 반경 내 핀 조회
    if (lat && lng && radius) {
      const pins = await PinRepository.findWithinRadius(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius)
      );
      return res.json({ success: true, data: pins });
    }

    const pins = await PinRepository.findAll();
    res.json({ success: true, data: pins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pins/:id
router.get('/:id', async (req, res) => {
  try {
    const pin = await PinRepository.findById(req.params.id);
    if (!pin) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pins
router.post('/', async (req, res) => {
  try {
    const { name, description, latitude, longitude, address, category } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'name, latitude, longitude는 필수입니다.' });
    }
    const pin = await PinRepository.create({ name, description, latitude, longitude, address, category });
    res.status(201).json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/pins/:id
router.put('/:id', async (req, res) => {
  try {
    const pin = await PinRepository.update(req.params.id, req.body);
    if (!pin) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/pins/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await PinRepository.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, message: '핀이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;