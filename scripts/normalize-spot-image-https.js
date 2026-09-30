// http:// 로 저장된 spots.first_image 를 https:// 로 검증 후 정규화.
// https 미지원이면 원본 유지 (앱 usesCleartextTraffic=true 로 표시됨).
require('dotenv').config();
const axios = require('axios');
const pool = require('../config/db');

const DRY = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { rows } = await pool.query(
    `SELECT spot_id, name, first_image FROM spots WHERE first_image LIKE 'http://%'`
  );
  console.log(`http 이미지 ${rows.length}건 검사 (dry-run=${DRY})`);

  let upgraded = 0, kept = 0;
  for (const r of rows) {
    const httpsUrl = r.first_image.replace(/^http:\/\//i, 'https://');
    try {
      await axios.head(httpsUrl, { timeout: 5000 });
      if (!DRY) {
        await pool.query('UPDATE spots SET first_image = $1 WHERE spot_id = $2', [httpsUrl, r.spot_id]);
      }
      upgraded++;
      console.log(`✅ https OK: ${r.name}`);
    } catch (_) {
      kept++;
      console.log(`·  https 미지원(http 유지): ${r.name}`);
    }
    await sleep(60);
  }
  console.log(`\n결과: https 승격 ${upgraded} / 유지 ${kept}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
