const express = require('express');
const router = express.Router();
const walkController = require('../controllers/walkController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, walkController.startWalk);           // POST /api/walks
router.patch('/:walkRecordId/end', authenticate, walkController.endWalk);  // PATCH /api/walks/:id/end
router.get('/', authenticate, walkController.getWalkList);          // GET /api/walks
router.get('/:walkRecordId', authenticate, walkController.getWalkDetail);  // GET /api/walks/:id

module.exports = router;