require('dotenv').config();

// 레거시 스팟 정리: "장소 하나는 카카오 장소 ID 하나"
//
// 예전 import:tourapi / sync:barrier-free / sync:pet 은 카카오 ID 대신
// tour_<contentId>, tour_with_<contentId>, 또는 ID 없이 스팟을 만들었고,
// 앱은 카카오 ID가 없는 TourAPI 장소를 tour:<contentId> 로 저장했다.
// 그래서 코스 경유지로 저장된 카카오 스팟과 같은 장소가 두 번 이상 생겼다.
//
// 1) 병합: 150m 안에 이름이 같은 카카오 스팟이 있으면, 레거시 스팟의 후기·북마크·태그·경유지 연결 등을
//    카카오 스팟으로 옮기고 비어 있는 정보(이미지·설명·무장애·반려동물)를 채운 뒤 레거시 스팟을 삭제한다.
// 2) 전환: DB에 짝이 없으면 카카오에서 같은 장소를 찾아 레거시 스팟의 kakao_place_id 를 카카오 ID로 바꾼다.
// 3) 둘 다 안 되면 그대로 두고 목록만 출력한다.
//
// 기본은 미리보기(변경 없음). 실제 반영은 --apply.
//   node scripts/merge-legacy-spots.js            # 미리보기
//   node scripts/merge-legacy-spots.js --apply    # 반영

const pool = require('../config/db');
const { legacyContentId, isSamePlaceName, findKakaoPlaceNear } = require('../utils/kakaoPlaceMatch');

const isApply = process.argv.includes('--apply');
// --limit=N: 병합·전환을 각각 앞에서 N개만 (검토용 소량 반영)
const limitArg = Math.max(0, Number.parseInt((process.argv.find((a) => a.startsWith('--limit=')) || '').slice(8), 10) || 0);
const MATCH_RADIUS_M = 150;
// 산책 장소가 아닌 레거시 스팟 (찜질방·스파·온천): 연결된 데이터가 없으면 삭제
const EXCLUDED_LEISURE_PATTERN = /찜질|사우나|스파|목욕|온천|워터파크/;
const KAKAO_SEARCH_RADIUS_M = 300;

// 카카오 장소 ID가 아닌 스팟: tour_*, tour_with_*, tour:*, ID 없음
const LEGACY_CONDITION = `(kakao_place_id IS NULL OR kakao_place_id ~ '^tour(_with)?[_:][0-9]+$')`;

// 레거시 스팟(from)을 카카오 스팟(to)으로 합친다. 한 트랜잭션 안에서 실행.
async function mergeSpot(client, from, to) {
  // 경유지·후기·AI 콘텐츠 (FK)
  await client.query(`UPDATE course_waypoints SET spot_id = $2 WHERE spot_id = $1`, [from.spot_id, to.spot_id]);
  // 같은 산책 기록으로 두 스팟에 모두 후기를 남긴 경우는 옮기지 않음 (유니크 제약)
  await client.query(
    `UPDATE spot_reviews r SET spot_id = $2
     WHERE r.spot_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM spot_reviews t
         WHERE t.spot_id = $2 AND t.walk_record_id = r.walk_record_id AND t.status = 'active'
       )`,
    [from.spot_id, to.spot_id]
  );
  // AI 해설은 다시 만들 수 있는 캐시라 대상에 없을 때만 옮긴다.
  await client.query(
    `UPDATE spot_ai_contents SET spot_id = $2
     WHERE spot_id = $1 AND NOT EXISTS (SELECT 1 FROM spot_ai_contents WHERE spot_id = $2)`,
    [from.spot_id, to.spot_id]
  );

  // 북마크·태그·신고·알림 (target_type = 'spot')
  await client.query(
    `UPDATE bookmarks b SET target_id = $2
     WHERE b.target_type = 'spot' AND b.target_id = $1
       AND NOT EXISTS (SELECT 1 FROM bookmarks t WHERE t.target_type = 'spot' AND t.target_id = $2 AND t.user_id = b.user_id)`,
    [from.spot_id, to.spot_id]
  );
  await client.query(`DELETE FROM bookmarks WHERE target_type = 'spot' AND target_id = $1`, [from.spot_id]);
  await client.query(
    `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
     SELECT tag_id, $2, 'spot', user_id FROM taggings WHERE target_type = 'spot' AND target_id = $1
     ON CONFLICT DO NOTHING`,
    [from.spot_id, to.spot_id]
  );
  await client.query(`DELETE FROM taggings WHERE target_type = 'spot' AND target_id = $1`, [from.spot_id]);
  await client.query(`UPDATE reports SET target_id = $2 WHERE target_type = 'spot' AND target_id = $1`, [from.spot_id, to.spot_id]);
  await client.query(`UPDATE notifications SET target_id = $2 WHERE target_type = 'spot' AND target_id = $1`, [from.spot_id, to.spot_id]);

  // 대상 스팟에 비어 있는 정보는 레거시 스팟 값으로 채운다.
  // TourAPI 번호는 중복 금지(uix_spots_tour_content_id)라 레거시 행에서 먼저 뺀다.
  const fromTourContentId = from.tour_content_id || legacyContentId(from.kakao_place_id);
  await client.query(`UPDATE spots SET tour_content_id = NULL WHERE spot_id = $1`, [from.spot_id]);
  await client.query(
    `UPDATE spots t SET
       first_image       = COALESCE(t.first_image, f.first_image),
       content_tour      = COALESCE(t.content_tour, f.content_tour),
       content_history   = COALESCE(t.content_history, f.content_history),
       barrier_free_info = COALESCE(t.barrier_free_info, f.barrier_free_info),
       pet_tour_info     = COALESCE(t.pet_tour_info, f.pet_tour_info),
       tour_content_id   = COALESCE(t.tour_content_id, $3)
     FROM spots f
     WHERE t.spot_id = $2 AND f.spot_id = $1`,
    [from.spot_id, to.spot_id, fromTourContentId]
  );

  await client.query(`DELETE FROM spots WHERE spot_id = $1`, [from.spot_id]);
}

async function convertSpot(client, spot, doc) {
  await client.query(
    `UPDATE spots
     SET kakao_place_id = $2,
         kakao_category_name = COALESCE(kakao_category_name, $3),
         tour_content_id = COALESCE(tour_content_id, $4)
     WHERE spot_id = $1`,
    [spot.spot_id, String(doc.id), doc.category_name || null, legacyContentId(spot.kakao_place_id)]
  );
}

async function main() {
  const { rows: legacySpots } = await pool.query(
    `SELECT spot_id, name, kakao_place_id, tour_content_id,
            ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y
     FROM spots
     WHERE ${LEGACY_CONDITION}
     ORDER BY created_at`
  );

  console.log(`🧹 레거시 스팟 정리 ${isApply ? '(반영)' : '(미리보기 — 변경 없음, 반영하려면 --apply)'}`);
  console.log(`- 대상: ${legacySpots.length}개 (tour_*, tour_with_*, tour:*, ID 없음)\n`);

  const plan = { merge: [], convert: [], keep: [], remove: [] };
  // 카카오 ID → 그 ID로 전환하기로 한 레거시 스팟 (같은 장소의 다른 레거시 스팟은 여기에 합친다)
  const convertedByKakaoId = new Map();

  for (const spot of legacySpots) {
    if (EXCLUDED_LEISURE_PATTERN.test(spot.name)) {
      const { rows: [refs] } = await pool.query(
        `SELECT (SELECT COUNT(*) FROM course_waypoints WHERE spot_id = $1)
              + (SELECT COUNT(*) FROM spot_reviews WHERE spot_id = $1)
              + (SELECT COUNT(*) FROM bookmarks WHERE target_type = 'spot' AND target_id = $1) AS n`,
        [spot.spot_id]
      );
      if (Number(refs.n) === 0) {
        plan.remove.push(spot);
        continue;
      }
    }

    // 1) DB 안의 카카오 스팟과 짝 찾기
    const { rows: nearby } = await pool.query(
      `SELECT spot_id, name, kakao_place_id,
              ST_Distance(location, ST_Point($2, $3)::geography) AS distance
       FROM spots
       WHERE spot_id <> $1
         AND NOT ${LEGACY_CONDITION}
         AND ST_DWithin(location, ST_Point($2, $3)::geography, $4)
       ORDER BY distance`,
      [spot.spot_id, spot.x, spot.y, MATCH_RADIUS_M]
    );
    const pair = nearby.find((candidate) => isSamePlaceName(spot.name, candidate.name));
    if (pair) {
      plan.merge.push({ spot, target: pair });
      continue;
    }

    // 2) 카카오에서 같은 장소 찾기
    const doc = await findKakaoPlaceNear({ name: spot.name, x: spot.x, y: spot.y, radius: KAKAO_SEARCH_RADIUS_M });
    if (doc) {
      const kakaoId = String(doc.id);
      const convertedSpot = convertedByKakaoId.get(kakaoId);
      if (convertedSpot) {
        // 같은 장소의 레거시 스팟이 이미 이 카카오 ID로 전환될 예정 → 그 스팟에 합친다.
        plan.merge.push({ spot, target: { ...convertedSpot, kakao_place_id: kakaoId, distance: doc.distance }, afterConvert: true });
        continue;
      }
      const { rows: taken } = await pool.query(`SELECT spot_id, name FROM spots WHERE kakao_place_id = $1`, [kakaoId]);
      if (taken.length) {
        // 반경 밖이었지만 같은 카카오 장소가 DB에 이미 있음 → 그 스팟에 합친다.
        plan.merge.push({ spot, target: { ...taken[0], kakao_place_id: kakaoId, distance: doc.distance } });
        continue;
      }
      convertedByKakaoId.set(kakaoId, spot);
      plan.convert.push({ spot, doc });
      continue;
    }
    plan.keep.push(spot);
  }

  console.log(`병합 (DB의 카카오 스팟으로 합침): ${plan.merge.length}개`);
  for (const { spot, target } of plan.merge) {
    console.log(`  ${spot.name} [${spot.kakao_place_id || 'ID 없음'}] → ${target.name} [${target.kakao_place_id}] (${Math.round(target.distance)}m)`);
  }
  console.log(`\n전환 (카카오 ID로 바꿈): ${plan.convert.length}개`);
  for (const { spot, doc } of plan.convert) {
    console.log(`  ${spot.name} [${spot.kakao_place_id || 'ID 없음'}] → 카카오 ${doc.place_name} [${doc.id}] (${doc.distance}m)`);
  }
  console.log(`\n삭제 (찜질방·스파·온천, 연결 데이터 없음): ${plan.remove.length}개`);
  if (plan.remove.length) console.log(`  ${plan.remove.map((s) => s.name).join(', ')}`);
  console.log(`\n유지 (카카오에서 못 찾음): ${plan.keep.length}개`);
  if (plan.keep.length) console.log(`  ${plan.keep.map((s) => s.name).join(', ')}`);

  if (limitArg > 0) {
    // 전환된 스팟에 합치는 병합은 그 전환이 포함될 때만 남긴다.
    plan.convert = plan.convert.slice(0, limitArg);
    const convertedIds = new Set(plan.convert.map(({ spot }) => spot.spot_id));
    plan.merge = plan.merge
      .filter(({ target, afterConvert }) => !afterConvert || convertedIds.has(target.spot_id))
      .slice(0, limitArg);
    console.log(`\n--limit=${limitArg}: 병합 ${plan.merge.length}개, 전환 ${plan.convert.length}개만 반영 대상`);
  }

  if (!isApply) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 전환을 먼저 해야 '전환된 레거시 스팟에 합치기'가 올바른 대상에 들어간다.
    for (const { spot, doc } of plan.convert) await convertSpot(client, spot, doc);
    for (const { spot, target } of plan.merge) await mergeSpot(client, spot, target);
    for (const spot of plan.remove) {
      await client.query(`DELETE FROM taggings WHERE target_type = 'spot' AND target_id = $1`, [spot.spot_id]);
      await client.query(`DELETE FROM spots WHERE spot_id = $1`, [spot.spot_id]);
    }
    await client.query('COMMIT');
    console.log(`\n✅ 반영 완료: 병합 ${plan.merge.length}, 전환 ${plan.convert.length}, 삭제 ${plan.remove.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(`레거시 스팟 정리 실패: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
