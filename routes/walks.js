const express = require('express');
const router = express.Router();
const walkController = require('../controllers/walkController');
const auth = require('../middleware/auth');

router.post('/start', auth, walkController.startWalk);
router.post('/:id/end', auth, walkController.endWalk);
router.post('/:id/spots', auth, walkController.addSpot);

module.exports = router;