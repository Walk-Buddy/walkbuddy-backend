const express = require('express');
const router = express.Router();
const reactionController = require('../controllers/reactionController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, reactionController.addReaction);
router.delete('/:target_type/:target_id', authenticate, reactionController.deleteReaction);

module.exports = router;