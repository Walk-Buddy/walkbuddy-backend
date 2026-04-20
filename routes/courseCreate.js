const express = require('express');
const router = express.Router();
// const auth = require('../middleware/auth'); // 테스트 시에는 주석 처리
const CourseCreateRepository = require('../repositories/courseCreateRepository');
const RouteService = require('../services/routeService');

// ─────────────────────────────────────────────────────────────────────
//  Course Create Routes
//  Base: /api/courses  (POST / 만 담당)
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/courses:
 * post:
 * summary: 코스 등록
 * description: |
 * 코스명·설명·태그·경로(핀/스팟)를 저장하고 거리/시간/난이도를 자동 계산합니다.
 * (현재 테스트를 위해 인증 토큰 없이도 허용 중)
 * tags: [Courses]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - title
 * - pins
 * properties:
 * title:
 * type: string
 * example: 한강 공원 산책
 * description:
 * type: string
 * example: 여의도부터 반포까지 이어지는 코스
 * visibility:
 * type: string
 * enum: [public, private]
 * default: public
 * pins:
 * type: array
 * items:
 * type: string
 * format: uuid
 * example: ["aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000002"]
 * spots:
 * type: array
 * items:
 * type: string
 * format: uuid
 * example: ["bbbbbbbb-0000-0000-0000-000000000001"]
 * tags:
 * type: array
 * items:
 * type: string
 * format: uuid
 * example: ["11111111-0000-0000-0000-000000000001"]
 * responses:
 * 201:
 * description: 코스 등록 성공
 * 400:
 * description: 필수 파라미터 누락
 */

router.post('/', async (req, res) => {
  // [수정] Seed 파일에 정의된 실제 테스터1의 UUID를 사용합니다.
  // 이 값은 DB의 users 테이블에 반드시 존재해야 합니다.
  const tempUserId = '00000000-0000-0000-0000-000000000001'; 

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
    // CourseCreateRepository 내부에서 DB 작업을 수행할 때 tempUserId를 작성자로 등록합니다.
    const courseId = await CourseCreateRepository.create({
      userId: tempUserId, 
      title,
      description,
      visibility,
      pins,
      spots,
      tags,
    });

    // ── 경로 자동 계산 (거리/시간/난이도) ────────────────────────────
    let routeResult = { totalDistanceKm: 0, estimatedMinutes: 0, difficulty: 1 };
    try {
      // OSRM API 호출 등을 통해 실제 경로 데이터를 생성합니다.
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
    // 에러 발생 시 터미널에서 상세 내용을 확인할 수 있도록 로그를 남깁니다.
    console.error("Course Create Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;