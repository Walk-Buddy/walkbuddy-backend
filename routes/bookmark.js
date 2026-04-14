const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const BookmarkRepository = require('../repositories/bookmarkRepository');
const CourseRepository   = require('../repositories/courseRepository');

// ─────────────────────────────────────────────────────────────────────
//  Bookmark Routes
//  Base: /api/courses/:courseId/bookmark
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/courses/{courseId}/bookmark:
 *   post:
 *     summary: 코스 북마크 추가/해제 토글
 *     description: |
 *       이미 북마크한 코스면 해제, 아니면 추가합니다.
 *       Authorization 헤더에 Bearer 토큰이 필요합니다.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 코스 UUID
 *     responses:
 *       200:
 *         description: 북마크 토글 결과
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
 *                     bookmarked:
 *                       type: boolean
 *                       example: true
 *                     count:
 *                       type: integer
 *                       example: 42
 *       401:
 *         description: 인증 토큰 없음 또는 유효하지 않음
 *       404:
 *         description: 코스를 찾을 수 없음
 */
router.post('/', auth, async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await CourseRepository.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    const result = await BookmarkRepository.toggle(req.userId, courseId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
