const express = require('express');
const router = express.Router();
const NodeRepository = require('../repositories/nodeRepository');

// ─────────────────────────────────────────────────────────────────────
//  Pin Routes  (node_type = 'pin')
//  Base: /api/pins
// ─────────────────────────────────────────────────────────────────────

// GET /api/pins
router.get('/', async (req, res) => {
  try {
    const pins = await NodeRepository.findAllPins();
    res.json({ success: true, data: pins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pins/:nodeId
router.get('/:nodeId', async (req, res) => {
  try {
    const pin = await NodeRepository.findPinById(req.params.nodeId);
    if (!pin) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pins
router.post('/', async (req, res) => {
  try {
    const { latitude, longitude, label, userId } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'latitude, longitude는 필수입니다.' });
    }
    const pin = await NodeRepository.createPin({ latitude, longitude, label, userId });
    res.status(201).json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/pins/:nodeId
router.put('/:nodeId', async (req, res) => {
  try {
    const pin = await NodeRepository.updatePin(req.params.nodeId, req.body);
    if (!pin) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, data: pin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/pins/:nodeId
router.delete('/:nodeId', async (req, res) => {
  try {
    const deleted = await NodeRepository.deletePin(req.params.nodeId);
    if (!deleted) return res.status(404).json({ success: false, message: '핀을 찾을 수 없습니다.' });
    res.json({ success: true, message: '핀이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;