const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');

router.patch('/:review_type/:review_id', authenticate, reviewController.updateReview);
router.delete('/:review_type/:review_id', authenticate, reviewController.deleteReview);

module.exports = router;