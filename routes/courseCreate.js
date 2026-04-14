const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const CourseCreateRepository = require('../repositories/courseCreateRepository');
const RouteService = require('../services/routeService');

// ─────────────────────────────────────────────────────────────────────
//  Course Create Routes
//  Base: /api/courses  (POST / 만 담당)
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: 코스 등록
 *     description: |
 *       코스명·설명·태그·경로(핀/스팟)를 저장하고 거리/시간/난이도를 자동 계산합니다.
 *       Bearer 토큰 필요.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - pins
 *             properties:
 *               title:
 *                 type: string
 *                 example: 한강 공원 산책
 *                 description: 코스명 (필수)
 *               description:
 *                 type: string
 *                 example: 여의도부터 반포까지 이어지는 코스
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *                 default: public
 *                 description: 공개 여부
 *               pins:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: 핀 nodeId 배열 (순서대로, 2개 이상 필수)
 *                 example: ["uuid-pin-1", "uuid-pin-2"]
 *               spots:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: 스팟 nodeId 배열 (선택)
 *                 example: ["uuid-spot-1"]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: 태그 ID 배열 (master_tags.tag_id, 선택)
 *                 example: ["uuid-tag-1", "uuid-tag-2"]
 *     responses:
 *       201:
 *         description: 코스 등록 성공
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
 *                     courseId:
 *                       type: string
 *                       format: uuid
 *                     totalDistanceKm:
 *                       type: number
 *                       example: 3.5
 *                     estimatedMinutes:
 *                       type: integer
 *                       example: 60
 *                     difficulty:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: 필수 파라미터 누락 또는 핀 2개 미만
 *       401:
 *         description: 인증 토큰 없음 또는 유효하지 않음
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      title,
      description,
      visibility = 'public',
      pins   = [],
      spots  = [],
      tags   = [],
    } = req.body;

    // ── 유효성 검사 ───────────────────────────────────────────────────
    if (!title) {
      return res.status(400).json({ success: false, message: 'title은 필수입니다.' });
    }
    if (!Array.isArray(pins) || pins.length < 2) {
      return res.status(400).json({ success: false, message: '핀이 2개 이상 필요합니다.' });
    }
    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ success: false, message: "visibility는 'public' 또는 'private'이어야 합니다." });
    }

    // ── 코스 등록 (트랜잭션) ─────────────────────────────────────────
    const courseId = await CourseCreateRepository.create({
      userId:      req.userId,
      title,
      description,
      visibility,
      pins,
      spots,
      tags,
    });

    // ── 경로 자동 계산 (거리/시간/난이도) ────────────────────────────
    // 외부 API(OSRM) 호출이므로 트랜잭션 외부에서 실행
    // 실패해도 코스 자체는 저장됨
    let routeResult = { totalDistanceKm: 0, estimatedMinutes: 0, difficulty: 1 };
    try {
      routeResult = await RouteService.buildRouteForCourse(courseId);
    } catch (routeErr) {
      console.warn(`⚠️  경로 계산 실패 (courseId: ${courseId}):`, routeErr.message);
    }

    res.status(201).json({
      success: true,
      data: {
        courseId,
        totalDistanceKm:  routeResult.totalDistanceKm,
        estimatedMinutes: routeResult.estimatedMinutes,
        difficulty:       routeResult.difficulty,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
