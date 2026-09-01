const express = require('express');
const router = express.Router();
const bookmarkController = require('../controllers/bookmarkController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, bookmarkController.addBookmark);
router.get('/', authenticate, bookmarkController.getBookmarks);
router.delete('/:bookmark_id', authenticate, bookmarkController.removeBookmark);

module.exports = router;
