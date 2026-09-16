const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

router.post('/preview', authenticate, courseController.previewCourse);
router.post('/from-walk', authenticate, courseController.createCourseFromWalk);
router.get('/search', optionalAuthenticate, courseController.searchCourses);
router.post('/', authenticate, courseController.createCourse);
router.get('/', optionalAuthenticate, courseController.getCourses);                         
router.get('/:course_id', optionalAuthenticate, courseController.getCourseById);           
router.patch('/:course_id', authenticate, courseController.updateCourse);      
router.delete('/:course_id', authenticate, courseController.deleteCourse);     
router.post('/:course_id/reviews', authenticate, reviewController.createCourseReview);
router.get('/:course_id/reviews', optionalAuthenticate, reviewController.getCourseReviews);

module.exports = router;
