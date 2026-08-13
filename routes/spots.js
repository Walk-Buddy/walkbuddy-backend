const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const router = express.Router();
const spotController = require('../controllers/spotController');
const { authenticate } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');
const s3 = require('../config/s3');

// 스팟 후기 사진 업로드 (최대 5장, 장당 5MB)
const reviewPhotoUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => cb(null, `reviews/${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
}).array('photos', 5);

router.get('/health', (req, res) => res.json({ success: true, message: 'spot router connected' }));
router.get('/search', spotController.searchSpots);
router.get('/filter', spotController.filterSpots);
router.get('/', spotController.getSpots);
router.get('/:spot_id/ai-contents', spotController.getAiContents);
router.get('/:spot_id', spotController.getSpotById);
router.post('/kakao', authenticate, spotController.saveKakaoSpot);
router.post('/', authenticate, spotController.createSpot);
router.post('/:spot_id/reviews', authenticate, reviewPhotoUpload, reviewController.createSpotReview);
router.get('/:spot_id/reviews', reviewController.getSpotReviews);

module.exports = router;
