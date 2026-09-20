const tagService = require('../services/tagService');

exports.getTags = async (req, res, next) => {
  try {
    const result = await tagService.getTags(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};
