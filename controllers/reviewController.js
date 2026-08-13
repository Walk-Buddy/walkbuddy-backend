const reviewService = require('../services/reviewService');

exports.createCourseReview = async (req, res, next) => {
  try {
    const result = await reviewService.createCourseReview(
      req.user.user_id, req.params.course_id, req.body
    );
    return res.status(201).json(result);
  } catch (err) { next(err); }
};

exports.getCourseReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getCourseReviews(
      req.params.course_id, req.query, req.user?.user_id
    );
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.createSpotReview = async (req, res, next) => {
  try {
    const result = await reviewService.createSpotReview(
      req.user.user_id, req.params.spot_id, req.body, req.files
    );
    return res.status(201).json(result);
  } catch (err) { next(err); }
};

exports.getSpotReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getSpotReviews(
      req.params.spot_id, req.query, req.user?.user_id
    );
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.updateReview = async (req, res, next) => {
  try {
    const result = await reviewService.updateReview(
      req.user.user_id, req.params.review_type, req.params.review_id, req.body
    );
    return res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.deleteReview = async (req, res, next) => {
  try {
    const result = await reviewService.deleteReview(
      req.user.user_id, req.params.review_type, req.params.review_id
    );
    return res.status(200).json(result);
  } catch (err) { next(err); }
};