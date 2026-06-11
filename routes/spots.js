const express = require('express');
const router = express.Router();
const spotController = require('../controllers/spotController');
const { authenticate } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

router.get('/health', (req, res) => res.json({ success: true, message: 'spot router connected' }));
router.get('/search', spotController.searchSpots);
router.get('/filter', spotController.filterSpots);
router.get('/', spotController.getSpots);
router.get('/:spot_id/ai-contents', spotController.getAiContents);
router.get('/:spot_id', spotController.getSpotById);
router.post('/kakao', authenticate, spotController.saveKakaoSpot);
router.post('/', authenticate, spotController.createSpot);
router.post('/:spot_id/reviews', authenticate, reviewController.createSpotReview);
router.get('/:spot_id/reviews', reviewController.getSpotReviews);

module.exports = router;
