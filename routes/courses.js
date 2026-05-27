const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/auth');

router.post('/preview', authenticate, courseController.previewCourse);
router.post('/from-walk', authenticate, courseController.createCourseFromWalk);
router.get('/search', courseController.searchCourses);
router.post('/', authenticate, courseController.createCourse);
router.get('/', courseController.getCourses);                          // 목록 (인증 선택)
router.get('/:course_id', courseController.getCourseById);             // 상세 (인증 선택)
router.patch('/:course_id', authenticate, courseController.updateCourse);      // 수정
router.delete('/:course_id', authenticate, courseController.deleteCourse);     // 삭제

module.exports = router;
