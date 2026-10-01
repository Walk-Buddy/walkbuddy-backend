/**
 * DB 태그를 정본 목록(constants/tagMaster.js = db/schema.sql 시드)과 똑같이 맞춘다.
 *  1. 정본 태그를 만들거나 그룹·후기 여부·활성 상태를 정본 값으로 맞춘다
 *  2. 옛 이름(TAG_ALIASES)에 붙어 있던 태그 연결은 정본 태그로 옮긴다
 *  3. 정본에 없는 태그는 지운다 (연결은 함께 지워지고, 사용자 선호 태그에서도 뺀다)
 *
 * 사용: node scripts/sync-tag-master.js          (미리보기)
 *       node scripts/sync-tag-master.js --apply  (DB 반영)
 */
require('dotenv').config();
const pool = require('../config/db');
const { MASTER, MASTER_NAMES, canonicalTagName } = require('../constants/tagMaster');

const APPLY = process.argv.includes('--apply');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [type, tags] of Object.entries(MASTER)) {
      for (const t of tags) {
        await client.query(
          `INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (name, type) DO UPDATE SET
             group_name = EXCLUDED.group_name,
             is_active = EXCLUDED.is_active,
             is_review_tag = EXCLUDED.is_review_tag`,
          [t.name, type, t.group, t.active !== false, t.review],
        );
      }
    }

    const { rows: extras } = await client.query(
      `SELECT t.tag_id, t.name, t.type, t.group_name, COUNT(g.tag_id)::int AS uses
         FROM tags t LEFT JOIN taggings g USING (tag_id)
        GROUP BY t.tag_id`,
    );
    const toRemove = extras.filter((t) => !MASTER_NAMES[t.type]?.has(t.name));

    // 옛 tag_id → 정본 tag_id (정본이 없으면 null: 연결만 지운다)
    const replacement = new Map();
    for (const t of toRemove) {
      const target = canonicalTagName(t.name, t.type);
      let targetId = null;
      let moved = 0;
      if (target) {
        const { rows } = await client.query('SELECT tag_id FROM tags WHERE name = $1 AND type = $2', [target, t.type]);
        targetId = rows[0]?.tag_id || null;
      }
      if (targetId && t.uses > 0) {
        const res = await client.query(
          `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
           SELECT $2, target_id, target_type, user_id FROM taggings WHERE tag_id = $1
           ON CONFLICT DO NOTHING`,
          [t.tag_id, targetId],
        );
        moved = res.rowCount;
      }
      replacement.set(String(t.tag_id), targetId ? String(targetId) : null);
      console.log(`- ${t.type} '${t.name}' (${t.group_name}, 연결 ${t.uses}) → ${targetId ? `'${target}'로 옮김 (새 연결 ${moved})` : '삭제'}`);
    }

    if (toRemove.length) {
      const { rows: users } = await client.query(
        `SELECT user_id, pref_tag_ids FROM users WHERE jsonb_typeof(pref_tag_ids) = 'array'`,
      );
      for (const u of users) {
        const ids = u.pref_tag_ids.map(String);
        if (!ids.some((id) => replacement.has(id))) continue;
        const next = [...new Set(ids.map((id) => (replacement.has(id) ? replacement.get(id) : id)).filter(Boolean))];
        await client.query('UPDATE users SET pref_tag_ids = $2::jsonb WHERE user_id = $1', [u.user_id, JSON.stringify(next)]);
      }
      await client.query('DELETE FROM tags WHERE tag_id = ANY($1::uuid[])', [toRemove.map((t) => t.tag_id)]);
    }

    const { rows: summary } = await client.query(
      `SELECT type, COUNT(*)::int AS n FROM tags GROUP BY type ORDER BY type`,
    );
    console.log(`\n정리 후 태그: ${summary.map((r) => `${r.type} ${r.n}개`).join(', ')} / 지울 태그 ${toRemove.length}개`);

    if (APPLY) {
      await client.query('COMMIT');
      console.log('반영 완료');
    } else {
      await client.query('ROLLBACK');
      console.log('미리보기입니다. 반영하려면 --apply');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
