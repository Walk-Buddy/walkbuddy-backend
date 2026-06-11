const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

router.post('/preview', authenticate, courseController.previewCourse);
router.post('/from-walk', authenticate, courseController.createCourseFromWalk);
router.get('/search', courseController.searchCourses);
router.post('/', authenticate, courseController.createCourse);
router.get('/', courseController.getCourses);                         
router.get('/:course_id', courseController.getCourseById);           
router.patch('/:course_id', authenticate, courseController.updateCourse);      
router.delete('/:course_id', authenticate, courseController.deleteCourse);     
router.post('/:course_id/reviews', authenticate, reviewController.createCourseReview);
router.get('/:course_id/reviews', reviewController.getCourseReviews);

module.exports = router;
