const express = require('express');
const router = express.Router();
const CourseDetailRepository = require('../repositories/courseDetailRepository');

// ─────────────────────────────────────────────────────────────────────
//  Course Detail Routes
//  Base: /api/courses  (GET /:courseId 만 담당)
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/courses/{courseId}:
 *   get:
 *     summary: 코스 상세 조회
 *     description: |
 *       코스 경로 좌표, 핀/스팟 노드 목록, 스팟 이미지·추천수, 코스 리뷰를 한번에 반환합니다.
 *     tags: [Courses]
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
 *         description: 코스 상세 정보 반환
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
 *                     course_id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     total_distance_km:
 *                       type: number
 *                       example: 3.5
 *                     estimated_minutes:
 *                       type: integer
 *                       example: 60
 *                     difficulty:
 *                       type: integer
 *                       example: 2
 *                     bookmark_count:
 *                       type: integer
 *                       example: 12
 *                     avg_rating:
 *                       type: number
 *                       example: 4.2
 *                     route:
 *                       type: object
 *                       description: "GeoJSON LineString (경로 좌표 배열, full_route 없으면 null)"
 *                       example: { "type": "LineString", "coordinates": [[126.97, 37.56], [126.98, 37.57]] }
 *                     nodes:
 *                       type: array
 *                       description: "경로 순서대로 정렬된 핀·스팟 목록"
 *                       items:
 *                         type: object
 *                         properties:
 *                           node_id:
 *                             type: string
 *                           node_type:
 *                             type: string
 *                             enum: [pin, spot]
 *                           node_order:
 *                             type: number
 *                           latitude:
 *                             type: number
 *                           longitude:
 *                             type: number
 *                           name:
 *                             type: string
 *                             description: "스팟만 존재"
 *                           description:
 *                             type: string
 *                             description: "스팟만 존재"
 *                           images:
 *                             type: array
 *                             description: "스팟만 존재"
 *                             items:
 *                               type: object
 *                               properties:
 *                                 image_url:
 *                                   type: string
 *                                 caption:
 *                                   type: string
 *                                 display_order:
 *                                   type: integer
 *                           recommend_count:
 *                             type: integer
 *                             description: "스팟만 존재"
 *                           total_reviews:
 *                             type: integer
 *                             description: "스팟만 존재"
 *                     reviews:
 *                       type: array
 *                       description: "최근 공개 리뷰 최대 5개"
 *                       items:
 *                         type: object
 *                         properties:
 *                           course_review_id:
 *                             type: string
 *                           user_id:
 *                             type: string
 *                           rating:
 *                             type: integer
 *                           content:
 *                             type: string
 *                           created_at:
 *                             type: string
 *       404:
 *         description: 코스를 찾을 수 없음
 */
router.get('/:courseId', async (req, res) => {
  try {
    const detail = await CourseDetailRepository.findDetail(req.params.courseId);
    if (!detail) {
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
