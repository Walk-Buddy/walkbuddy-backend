const pool = require('../config/db');

exports.addReaction = async (userId, body) => {
  const { target_id, target_type, reaction } = body;

  if (!['course_review', 'spot_review'].includes(target_type)) {
    const err = new Error('target_type은 course_review 또는 spot_review여야 합니다.');
    err.status = 400; throw err;
  }
  if (!['like', 'dislike'].includes(reaction)) {
    const err = new Error('reaction은 like 또는 dislike여야 합니다.');
    err.status = 400; throw err;
  }

  const { rows: [result] } = await pool.query(
    `INSERT INTO reactions (user_id, target_id, target_type, reaction)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, target_id, target_type)
     DO UPDATE SET reaction = EXCLUDED.reaction
     RETURNING target_id, target_type, reaction, created_at`,
    [userId, target_id, target_type, reaction]
  );
  return result;
};

exports.deleteReaction = async (userId, targetType, targetId) => {
  const { rows } = await pool.query(
    `DELETE FROM reactions
     WHERE user_id = $1 AND target_id = $2 AND target_type = $3
     RETURNING target_id`,
    [userId, targetId, targetType]
  );
  if (!rows.length) {
    const err = new Error('반응을 찾을 수 없습니다.'); err.status = 404; throw err;
  }
  return { message: '취소되었습니다.' };
};