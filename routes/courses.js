const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const auth = require('../middleware/auth');

router.post('/preview', auth, courseController.previewCourse);
router.post('/from-walk', auth, courseController.createCourseFromWalk);
router.post('/', auth, courseController.createCourse);
router.get('/', courseController.getCourses);                          // 목록 (인증 선택)
router.get('/:course_id', courseController.getCourseById);             // 상세 (인증 선택)
router.patch('/:course_id', auth, courseController.updateCourse);      // 수정
router.delete('/:course_id', auth, courseController.deleteCourse);     // 삭제

module.exports = router;