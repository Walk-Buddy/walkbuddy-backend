const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, userController.getProfile);
router.patch('/me', authenticate, userController.updateProfile);
router.patch('/me/password', authenticate, userController.changePassword);
router.get('/me/history', authenticate, userController.getHistory);
router.get('/me/courses', authenticate, userController.getMyCourses);
router.get('/me/reviews', authenticate, userController.getMyReviews);

module.exports = router;
