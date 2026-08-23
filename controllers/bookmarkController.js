const bookmarkService = require('../services/bookmarkService');

exports.addBookmark = async (req, res, next) => {
  try {
    const { target_id, target_type } = req.body;
    const result = await bookmarkService.addBookmark(req.user.user_id, target_id, target_type);
    return res.status(201).json(result);
  } catch (err) { next(err); }
};

exports.removeBookmark = async (req, res, next) => {
  try {
    const result = await bookmarkService.removeBookmark(req.user.user_id, req.params.bookmark_id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getBookmarks = async (req, res, next) => {
  try {
    const result = await bookmarkService.getBookmarks(req.user.user_id, req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};
