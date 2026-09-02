const pool = require('../config/db');

// UUID 정규식 검증 헬퍼
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

// ──────────────────────────────────────────────────────────────────────
// 1. 사용자 차단하기 (POST /api/users/blocks)
// ──────────────────────────────────────────────────────────────────────
exports.blockUser = async (blockerId, blockedUserId) => {
  if (!blockedUserId || !isValidUUID(blockedUserId)) {
    const err = new Error('유효한 UUID 형식의 blocked_user_id가 필요합니다.');
    err.status = 400;
    throw err;
  }

  // 1-1. 자기 자신 차단 방지
  if (blockerId === blockedUserId) {
    const err = new Error('자기 자신을 차단할 수 없습니다.');
    err.status = 400;
    throw err;
  }

  // 1-2. 차단 대상 사용자 존재 여부 및 탈퇴 상태 검증
  const { rows: [targetUser] } = await pool.query(
    'SELECT user_id, nickname, status FROM users WHERE user_id = $1',
    [blockedUserId]
  );

  if (!targetUser) {
    const err = new Error('차단 대상 사용자를 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  if (targetUser.status === 'deleted') {
    const err = new Error('탈퇴한 사용자는 차단할 수 없습니다.');
    err.status = 400;
    throw err;
  }

  // 1-3. 중복 차단 여부 검증
  const { rows: existing } = await pool.query(
    'SELECT block_id FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedUserId]
  );

  if (existing.length > 0) {
    const err = new Error('이미 차단한 사용자입니다.');
    err.status = 409;
    throw err;
  }

  // 1-4. DB INSERT
  const { rows: [block] } = await pool.query(
    `INSERT INTO user_blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     RETURNING block_id, blocker_id, blocked_id, created_at`,
    [blockerId, blockedUserId]
  );

  return block;
};

// ──────────────────────────────────────────────────────────────────────
// 2. 사용자 차단 해제하기 (DELETE /api/users/blocks/:blocked_user_id)
// ──────────────────────────────────────────────────────────────────────
exports.unblockUser = async (blockerId, blockedUserId) => {
  if (!blockedUserId || !isValidUUID(blockedUserId)) {
    const err = new Error('유효한 UUID 형식의 blocked_user_id가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const { rows: [deletedBlock] } = await pool.query(
    `DELETE FROM user_blocks
     WHERE blocker_id = $1 AND blocked_id = $2
     RETURNING block_id`,
    [blockerId, blockedUserId]
  );

  if (!deletedBlock) {
    const err = new Error('차단 내역이 존재하지 않습니다.');
    err.status = 404;
    throw err;
  }

  return {
    success: true,
    message: '차단이 성공적으로 해제되었습니다.'
  };
};

// ──────────────────────────────────────────────────────────────────────
// 3. 내 차단 목록 조회 (GET /api/users/blocks)
// ──────────────────────────────────────────────────────────────────────
exports.getBlockedUsers = async (blockerId, query = {}) => {
  const { page = 1, limit = 20 } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  // 전체 개수 조회
  const { rows: [{ total }] } = await pool.query(
    'SELECT COUNT(*) AS total FROM user_blocks WHERE blocker_id = $1',
    [blockerId]
  );

  // 차단 목록 및 차단된 유저 프로필 정보 조회
  const { rows: blocks } = await pool.query(
    `SELECT
       ub.block_id,
       ub.created_at,
       json_build_object(
         'user_id', u.user_id,
         'nickname', u.nickname,
         'profile_image_url', u.profile_image_url
       ) AS blocked_user
     FROM user_blocks ub
     JOIN users u ON u.user_id = ub.blocked_id
     WHERE ub.blocker_id = $1
     ORDER BY ub.created_at DESC
     LIMIT $2 OFFSET $3`,
    [blockerId, limitNum, offset]
  );

  return {
    total: parseInt(total, 10),
    page: pageNum,
    limit: limitNum,
    blocks
  };
};
