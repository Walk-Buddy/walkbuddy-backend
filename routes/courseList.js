const express = require('express');
const router = express.Router();
const CourseListRepository = require('../repositories/courseListRepository');

// ─────────────────────────────────────────────────────────────────────
//  Course List Routes
//  Base: /api/courses  (GET / 만 담당 — 나머지는 courses.js)
// ─────────────────────────────────────────────────────────────────────

const VALID_SORTS = ['latest', 'popularity', 'nearest', 'distance', 'difficulty', 'estimated_time'];
const VALID_CREATION_TYPES = ['manual', 'auto'];

/** 한 페이지 최대 건수 (Postman 등에서 전체 조회 시 사용 — 응답이 매우 커질 수 있음) */
const MAX_LIMIT = 2000;

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: 코스 목록 조회 (정렬 / 필터 / 페이지네이션)
 *     tags: [Courses]
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, popularity, nearest, distance, difficulty, estimated_time]
 *           default: latest
 *         description: |
 *           정렬 기준
 *           - latest: 최신순
 *           - popularity: 인기순 (북마크↓, 평점↓)
 *           - nearest: 가까운 순 (lat, lng 필수)
 *           - distance: 짧은 거리순
 *           - difficulty: 쉬운 난이도순
 *           - estimated_time: 짧은 시간순
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *           example: 37.5665
 *         description: 위도 (sort=nearest 일 때 필수)
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *           example: 126.9780
 *         description: 경도 (sort=nearest 일 때 필수)
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3]
 *         description: "난이도 필터 (1: 쉬움, 2: 보통, 3: 어려움)"
 *       - in: query
 *         name: min_distance
 *         schema:
 *           type: number
 *           example: 1.0
 *         description: 최소 거리 (km)
 *       - in: query
 *         name: max_distance
 *         schema:
 *           type: number
 *           example: 5.0
 *         description: 최대 거리 (km)
 *       - in: query
 *         name: min_time
 *         schema:
 *           type: integer
 *           example: 30
 *         description: 최소 예상 시간 (분)
 *       - in: query
 *         name: max_time
 *         schema:
 *           type: integer
 *           example: 90
 *         description: 최대 예상 시간 (분)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 2000
 *         description: 페이지당 항목 수 (최대 2000, 기본 10)
 *     responses:
 *       200:
 *         description: 코스 목록 반환
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
 *                     total:
 *                       type: integer
 *                       example: 42
 *       400:
 *         description: 잘못된 요청 (sort 값 오류, nearest 시 lat/lng 누락)
 */
router.get('/', async (req, res) => {
  try {
    const {
      sort        = 'latest',
      lat,
      lng,
      difficulty,
      min_distance,
      max_distance,
      min_time,
      max_time,
      creation_type,
      page        = 1,
      limit       = 10,
    } = req.query;

    const creationType =
      creation_type === '' || creation_type === undefined ? undefined : creation_type;

    // ── 유효성 검사 ───────────────────────────────────────────────────
    if (!VALID_SORTS.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: `sort 값이 올바르지 않습니다. 허용 값: ${VALID_SORTS.join(', ')}`,
      });
    }

    if (creationType !== undefined && !VALID_CREATION_TYPES.includes(creationType)) {
      return res.status(400).json({
        success: false,
        message: `creation_type 은 ${VALID_CREATION_TYPES.join(', ')} 중 하나이거나 생략해야 합니다.`,
      });
    }

    if (sort === 'nearest' && (lat === undefined || lng === undefined)) {
      return res.status(400).json({
        success: false,
        message: 'nearest 정렬에는 lat, lng 쿼리 파라미터가 필요합니다.',
      });
    }

    // ── Repository 호출 ───────────────────────────────────────────────
    const result = await CourseListRepository.findList({
      sort,
      lat:          lat          !== undefined ? Number(lat)          : undefined,
      lng:          lng          !== undefined ? Number(lng)          : undefined,
      difficulty:   difficulty   !== undefined ? Number(difficulty)   : undefined,
      min_distance: min_distance !== undefined ? Number(min_distance) : undefined,
      max_distance: max_distance !== undefined ? Number(max_distance) : undefined,
      min_time:     min_time     !== undefined ? Number(min_time)     : undefined,
      max_time:     max_time     !== undefined ? Number(max_time)     : undefined,
      creation_type: creationType,
      page:  Math.max(1, Number(page)),
      limit: Math.min(Math.max(1, Number(limit)), MAX_LIMIT),
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
