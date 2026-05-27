const express = require('express');
const router = express.Router();
const walkController = require('../controllers/walkController');
const { authenticate } = require('../middleware/auth');

router.post('/start', authenticate, walkController.startWalk);
router.post('/:id/end', authenticate, walkController.endWalk);
router.post('/:id/spots', authenticate, walkController.addSpot);

module.exports = router;
