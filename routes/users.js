const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const blockController = require('../controllers/blockController');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, userController.getProfile);
router.patch('/me', authenticate, userController.updateProfile);
router.patch('/me/password', authenticate, userController.changePassword);
router.get('/me/stats', authenticate, userController.getStats);
router.get('/me/history', authenticate, userController.getHistory);
router.get('/me/courses', authenticate, userController.getMyCourses);
router.get('/me/reviews', authenticate, userController.getMyReviews);

// ── 사용자 차단 관리 라우트 ─────────────────────────────────────────
router.post('/blocks', authenticate, blockController.blockUser);
router.delete('/blocks/:blocked_user_id', authenticate, blockController.unblockUser);
router.get('/blocks', authenticate, blockController.getBlockedUsers);

module.exports = router;

