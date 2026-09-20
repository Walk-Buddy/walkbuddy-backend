// ============================================================
// 스팟 태그·투어정보 백필 스크립트
// ------------------------------------------------------------
// 임포트(import-durunubi / import-street-tourism) 과정에서
// TourAPI 429(rate limit) 또는 enrich 버그로 스팟 세부 태그가
// 부착되지 못한 스팟들을 대상으로, spotService.enrichKakaoSpotTourContent()
// 를 재실행하여 다음을 다시 채운다.
//   - content_tour (개요 + Odii 스토리 해설 병합)
//   - barrier_free_info (무장애 편의시설)
//   - pet_tour_info (반려동물 동반 정보)
//   - first_image (TourAPI 대표 이미지)
//   - 스팟 세부 태그(열린관광/휠체어대여/반려견동반 등) → taggings
//
// [rate limit 대응]
//   호출 사이에 --sleep(기본 350ms) 지연을 두어 429 를 최소화한다.
//   429 가 나면 해당 스팟은 건너뛰고 다음 실행에서 다시 시도할 수 있다.
//
// [idempotent]
//   태그 부착은 ON CONFLICT DO NOTHING, content_tour 는 NULL 인 경우만 채우므로
//   여러 번 돌려도 안전하다.
//
// [사용법]
//   node scripts/backfill-spot-tags.js                 # 태그 없는 스팟 전체
//   node scripts/backfill-spot-tags.js --limit=20      # 앞에서 20개만
//   node scripts/backfill-spot-tags.js --region=서울
//   node scripts/backfill-spot-tags.js --all           # 태그 유무 무관 전체
//   node scripts/backfill-spot-tags.js --dry-run       # 미리보기만
//   node scripts/backfill-spot-tags.js --sleep=500     # 호출 간 지연(ms)
// ============================================================
require('dotenv').config();

const pool = require('../config/db');
const spotService = require('../services/spotService');

const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const LIMIT = getArg('--limit') ? Number(getArg('--limit')) : null;
const REGION = getArg('--region');
const SLEEP_MS = getArg('--sleep') ? Number(getArg('--sleep')) : 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 대상 스팟 조회: 기본은 "태그가 없는 스팟"만 (자동 태깅 누락분 복구 목적)
  const where = ["s.status = 'active'"];
  const params = [];

  if (REGION) {
    params.push(REGION);
    where.push(`s.region = $${params.length}`);
  }

  if (!ALL) {
    where.push(
      "NOT EXISTS (SELECT 1 FROM taggings tg WHERE tg.target_id = s.spot_id AND tg.target_type = 'spot')"
    );
  }

  const limitSql = LIMIT ? `LIMIT ${Number(LIMIT)}` : '';

  const { rows: spots } = await pool.query(
    `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories,
            s.kakao_category_name, s.recommend_pct, s.content_tour,
            s.barrier_free_info, s.pet_tour_info, s.first_image,
            ST_X(s.location::geometry) AS x,
            ST_Y(s.location::geometry) AS y
     FROM spots s
     WHERE ${where.join(' AND ')}
     ORDER BY s.created_at ASC
     ${limitSql}`,
    params
  );

  console.log(
    `\n🏷️  스팟 태그 백필 시작: 대상 ${spots.length}개 (dry-run=${DRY_RUN}, sleep=${SLEEP_MS}ms, all=${ALL})\n`
  );

  const summary = {
    scanned: 0,
    tagged: 0,
    tags_added: 0,
    content_enriched: 0,
    skipped_no_match: 0,
    rate_limited: 0,
    failed: 0,
  };

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    summary.scanned += 1;
    process.stdout.write(`[${i + 1}/${spots.length}] ${spot.name} ... `);

    const enrichedSpot = {
      spot_id: spot.spot_id,
      kakao_place_id: spot.kakao_place_id,
      name: spot.name,
      address: spot.address,
      categories: spot.categories,
      kakao_category_name: spot.kakao_category_name,
      recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
      content_tour: spot.content_tour,
      barrier_free_info: spot.barrier_free_info,
      pet_tour_info: spot.pet_tour_info,
      first_image: spot.first_image,
      x: Number(spot.x),
      y: Number(spot.y),
    };

    if (DRY_RUN) {
      console.log('(dry-run)');
      await sleep(SLEEP_MS);
      continue;
    }

    try {
      const res = await spotService.enrichKakaoSpotTourContent(enrichedSpot, null);

      const attached = res?.attached_tags || [];
      if (attached.length > 0) {
        summary.tagged += 1;
        summary.tags_added += attached.length;
        console.log(`✅ 태그: ${attached.join(', ')}`);
      } else if (res?.tour_content_status === 'tour_api_error') {
        // 429 등 API 실패 → 다음 실행에서 재시도 대상
        summary.rate_limited += 1;
        console.log('⏳ API 실패(재시도 필요)');
      } else if (res?.tour_content_status === 'no_matching_tour_place') {
        summary.skipped_no_match += 1;
        console.log('➖ TourAPI 매칭 없음');
      } else {
        console.log('➖ 신규 태그 없음');
      }

      if (res?.tour_content_enriched || res?.barrier_free_enriched || res?.pet_tour_enriched) {
        summary.content_enriched += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.warn(`⚠️  실패: ${err.message}`);
    }

    await sleep(SLEEP_MS);
  }

  console.log('\n──────── 스팟 태그 백필 결과 ────────');
  console.log(JSON.stringify(summary, null, 2));
  if (DRY_RUN) console.log('(dry-run 이므로 DB 미반영)');
  console.log('');

  await pool.end();
}

main().catch((err) => {
  console.error(`스팟 태그 백필 중단: ${err.message}`);
  process.exit(1);
});
