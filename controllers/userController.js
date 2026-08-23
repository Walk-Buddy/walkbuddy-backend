const userService = require('../services/userService');
const courseService = require('../services/courseService');
const reviewService = require('../services/reviewService');

exports.getProfile = async (req, res, next) => {
  try {
    const result = await userService.getProfile(req.user.user_id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const result = await userService.updateProfile(req.user.user_id, req.body);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      const err = new Error('current_password, new_password는 필수입니다.');
      err.status = 400; throw err;
    }
    const result = await userService.changePassword(req.user.user_id, current_password, new_password);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getHistory = async (req, res, next) => {
  try {
    const result = await userService.getHistory(req.user.user_id, req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getMyCourses = async (req, res, next) => {
  try {
    const result = await courseService.getMyCourses(req.user.user_id, req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getMyReviews(req.user.user_id, req.query);
    return res.status(200).json(result);
  } catch (err) { next(err); }
};
