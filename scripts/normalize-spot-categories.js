/**
 * 장소 카테고리를 앱 카테고리 10종(SPOT_CATEGORIES)으로 정리한다.
 *
 * 예전 import 는 이름으로 분류하지 못한 장소에 카카오 분류 이름("문화유적", "불교", "교량,다리" 등)을
 * 그대로 저장해, 앱 카테고리 필터 어디에도 나오지 않는 장소가 있었다.
 * 현재 분류 규칙(inferSpotCategoriesWithFallback)으로 다시 분류하고, 앱 카테고리 값은 유지한다.
 * 대응되는 앱 카테고리가 없는 장소(마을회관·학교 등)는 빈 카테고리가 된다. 장소와 코스 경유지 연결은 그대로 둔다.
 *
 * 사용: node scripts/normalize-spot-categories.js          (미리보기)
 *       node scripts/normalize-spot-categories.js --apply  (DB 반영)
 */
require('dotenv').config();
const pool = require('../config/db');
const { SPOT_CATEGORIES, inferSpotCategoriesWithFallback } = require('../constants/spotCategoryRules');

const APPLY = process.argv.includes('--apply');

async function main() {
  const { rows } = await pool.query(
    `SELECT spot_id, name, categories, kakao_category_name
       FROM spots
      WHERE NOT (COALESCE(categories, '{}') <@ $1::text[])`,
    [SPOT_CATEGORIES],
  );

  const changes = rows.map((spot) => {
    const kept = (spot.categories || []).filter((c) => SPOT_CATEGORIES.includes(c));
    const inferred = inferSpotCategoriesWithFallback({
      place_name: spot.name,
      category_name: spot.kakao_category_name || '',
    });
    return { ...spot, next: [...new Set([...kept, ...inferred])] };
  });

  const summary = new Map();
  for (const c of changes) {
    const key = `${(c.categories || []).join('/')} → ${c.next.join('/') || '(분류 없음)'}`;
    summary.set(key, [...(summary.get(key) || []), c.name]);
  }
  for (const [key, names] of [...summary].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${key}  (${names.length}) ${names.slice(0, 6).join(', ')}${names.length > 6 ? ' …' : ''}`);
  }
  console.log(`\n대상 ${changes.length}곳`);

  if (!APPLY) {
    console.log('미리보기입니다. 반영하려면 --apply');
    return;
  }
  for (const c of changes) {
    await pool.query('UPDATE spots SET categories = $2, updated_at = NOW() WHERE spot_id = $1', [c.spot_id, c.next]);
  }
  console.log(`${changes.length}곳 반영 완료`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
