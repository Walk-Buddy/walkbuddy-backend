const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const auth = require('../middleware/auth');

router.post('/preview', auth, courseController.previewCourse);
router.post('/from-walk', auth, courseController.createCourseFromWalk);
router.post('/', auth, courseController.createCourse);

module.exports = router;