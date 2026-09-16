const reactionService = require('../services/reactionService');

exports.addReaction = async (req, res, next) => {
  try {
    const result = await reactionService.addReaction(req.user.user_id, req.body);
    return res.status(201).json(result);
  } catch (err) { next(err); }
};

exports.deleteReaction = async (req, res, next) => {
  try {
    const result = await reactionService.deleteReaction(
      req.user.user_id, req.params.target_type, req.params.target_id
    );
    return res.status(200).json(result);
  } catch (err) { next(err); }
};