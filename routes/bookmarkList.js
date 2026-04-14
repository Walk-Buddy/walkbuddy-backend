const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const BookmarkListRepository = require('../repositories/bookmarkListRepository');

// ─────────────────────────────────────────────────────────────────────
//  Bookmark List Routes
//  Base: /api/bookmarks
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/bookmarks:
 *   get:
 *     summary: 내 북마크 코스 목록 조회
 *     description: 로그인한 사용자가 북마크한 코스 목록을 반환합니다. Bearer 토큰 필요.
 *     tags: [Bookmarks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: 페이지당 항목 수 (최대 100)
 *     responses:
 *       200:
 *         description: 북마크 목록 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     courses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           course_id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           total_distance_km:
 *                             type: number
 *                           estimated_minutes:
 *                             type: integer
 *                           difficulty:
 *                             type: integer
 *                           bookmark_count:
 *                             type: integer
 *                           avg_rating:
 *                             type: number
 *                           bookmarked_at:
 *                             type: string
 *                             description: 북마크한 시각
 *                     total:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: 인증 토큰 없음 또는 유효하지 않음
 */
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(Math.max(1, Number(req.query.limit || 10)), 100);

    const result = await BookmarkListRepository.findByUser(req.userId, page, limit);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
