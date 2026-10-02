/**
 * utils/systemAccount.js
 *
 * 공공데이터 코스의 주인이자 자동 태그를 다는 시스템 계정. 앱의 코스 정보에 작성자 'GilBom'으로 보인다.
 * (예전 이름: 두루누비관리. social_id 'durunubi-admin' 으로 찾는다)
 *
 * IMPORTANT: 예전엔 import·태그 코드마다 "가장 먼저 만든 관리자"나 별도 계정('자동태깅', '공공데이터관리')을 써서
 * 사람 관리자 계정(유정·상지 등)이 코스 주인으로 보일 수 있었다. 시스템 계정은 반드시 이 함수로만 찾는다.
 */
const SYSTEM_ACCOUNT = { nickname: 'GilBom', socialProvider: 'seed', socialId: 'durunubi-admin' };

let cachedId = null;

/** @param db pool 또는 트랜잭션 client */
async function getSystemAccountId(db) {
  if (cachedId) return cachedId;
  const find = async () => (await db.query(
    `SELECT user_id FROM users WHERE social_provider = $1 AND social_id = $2 LIMIT 1`,
    [SYSTEM_ACCOUNT.socialProvider, SYSTEM_ACCOUNT.socialId],
  )).rows[0]?.user_id || null;

  let id = await find();
  if (!id) {
    await db.query(
      `INSERT INTO users (nickname, social_provider, social_id, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       ON CONFLICT DO NOTHING`,
      [SYSTEM_ACCOUNT.nickname, SYSTEM_ACCOUNT.socialProvider, SYSTEM_ACCOUNT.socialId],
    );
    id = await find();
    if (!id) throw new Error(`시스템 계정을 만들 수 없습니다 (닉네임 '${SYSTEM_ACCOUNT.nickname}'이 다른 계정에 쓰이고 있는지 확인)`);
  }
  cachedId = id;
  return id;
}

module.exports = { SYSTEM_ACCOUNT, getSystemAccountId };
