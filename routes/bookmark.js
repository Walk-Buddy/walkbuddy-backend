const express = require('express');
const router = express.Router({ mergeParams: true });
const BookmarkRepository = require('../repositories/bookmarkRepository');
const CourseRepository   = require('../repositories/courseRepository');

// GET /api/bookmarks
router.get('/', async (req, res) => {
  try {
    const bookmarks = await BookmarkRepository.findAll();
    res.json({ success: true, data: bookmarks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/courses/:courseId/bookmark
router.post('/', async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = '00000000-0000-0000-0000-000000000001'; // 임시

    const course = await CourseRepository.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    const result = await BookmarkRepository.toggle(userId, courseId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;