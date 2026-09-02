const blockService = require('../services/blockService');

/**
 * 사용자 차단 컨트롤러
 * POST /api/users/blocks
 */
exports.blockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.user_id;
    const { blocked_user_id } = req.body;

    const result = await blockService.blockUser(blockerId, blocked_user_id);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 사용자 차단 해제 컨트롤러
 * DELETE /api/users/blocks/:blocked_user_id
 */
exports.unblockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.user_id;
    const { blocked_user_id } = req.params;

    const result = await blockService.unblockUser(blockerId, blocked_user_id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * 내 차단 목록 조회 컨트롤러
 * GET /api/users/blocks
 */
exports.getBlockedUsers = async (req, res, next) => {
  try {
    const blockerId = req.user.user_id;
    const result = await blockService.getBlockedUsers(blockerId, req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
