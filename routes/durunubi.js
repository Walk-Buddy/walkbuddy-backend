/**
 * routes/durunubi.js
 *
 * 두루누비 실시간 API 라우터
 * app.js에서 '/api/tour/durunubi' 경로에 마운트됩니다.
 *
 * 엔드포인트:
 *   GET /api/tour/durunubi/courses              — 지역별 코스 목록
 *   GET /api/tour/durunubi/courses/:crs_idx     — 코스 상세
 *   GET /api/tour/durunubi/courses/:crs_idx/spots — 코스 스팟 목록
 */

const express = require('express');
const router = express.Router();
const durunubiController = require('../controllers/durunubiController');

// 지역별 두루누비 코스 목록 (실시간)
// 예: GET /api/tour/durunubi/courses?region=서울
// 예: GET /api/tour/durunubi/courses?region=강남구&page=1&limit=20
// 예: GET /api/tour/durunubi/courses?region=춘천
router.get('/courses', durunubiController.getCourses);

// 두루누비 코스 상세 (실시간)
// 예: GET /api/tour/durunubi/courses/21001
router.get('/courses/:crs_idx', durunubiController.getCourseDetail);

// 두루누비 코스 내 스팟 목록 (실시간)
// 예: GET /api/tour/durunubi/courses/21001/spots
router.get('/courses/:crs_idx/spots', durunubiController.getCourseSpots);

module.exports = router;
