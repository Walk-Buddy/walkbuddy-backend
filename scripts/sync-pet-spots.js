#!/usr/bin/env node
/**
 * scripts/sync-pet-spots.js
 * ─────────────────────────────────────────────────────────────
 * 한국관광공사 반려동물 동반여행(KorPetTourService2) API를 호출하여
 * 지역별 반려동물 관광지를 DB spots에 등록/동기화하고,
 * 세부 태그(#반려견동반, #대형견가능, #소형견동반, #반려견배변시설 등)를 taggings에 적재한다.
 *
 * 사용법:
 *   node scripts/sync-pet-spots.js                # 춘천 기본 동기화
 *   node scripts/sync-pet-spots.js --region=춘천   # 특정 지역 지정
 */

require('dotenv').config();
const pool = require('../config/db');
const tourApiService = require('../services/tourApiService');

const REGION = (() => {
  const arg = process.argv.find((a) => a.startsWith('--region='));
  return arg ? arg.split('=')[1] : '춘천';
})();

async function ensureSystemTaggerId() {
  const { rows: admins } = await pool.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`
  );
  if (admins.length) return admins[0].user_id;

  const { rows: seedUsers } = await pool.query(
    `SELECT user_id FROM users WHERE social_provider = 'seed' AND social_id = 'system-tagger' LIMIT 1`
  );
  if (seedUsers.length) return seedUsers[0].user_id;

  const { rows: created } = await pool.query(
    `INSERT INTO users (email, nickname, role, status, social_provider, social_id)
     VALUES ('system-tagger@gilbom.internal', '길봄태거', 'admin', 'active', 'seed', 'system-tagger')
     RETURNING user_id`
  );
  return created[0].user_id;
}

async function attachTagsToSpot(spotId, tagNames, userId) {
  if (!tagNames || tagNames.length === 0) return;
  const cleanNames = tagNames.map((n) => String(n).replace(/^#/, '').trim()).filter(Boolean);

  const { rows: tags } = await pool.query(
    `SELECT tag_id, name FROM tags WHERE name = ANY($1::TEXT[]) AND type = 'spot' AND is_active = TRUE`,
    [cleanNames]
  );
  if (!tags.length) return;

  for (const t of tags) {
    await pool.query(
      `INSERT INTO taggings (tag_id, target_type, target_id, user_id)
       VALUES ($1, 'spot', $2, $3)
       ON CONFLICT (tag_id, target_type, target_id, user_id) DO NOTHING`,
      [t.tag_id, spotId, userId]
    );
  }
}

(async () => {
  console.log(`\n🐾 [반려동물 동반 스팟 동기화 시작] 지역: ${REGION}`);
  const taggerId = await ensureSystemTaggerId();

  try {
    const listRes = await tourApiService.getPetTourSpots({ region: REGION, limit: 50 });
    const spots = listRes.spots || [];
    console.log(`한국관광공사 반려동물 관광지 ${spots.length}건 수신 완료`);

    let syncedCount = 0;
    let taggedCount = 0;

    for (const item of spots) {
      if (!item.title) continue;

      // 1. 상세 정보 조회 (세부 태그 도출)
      let detail = null;
      if (item.content_id) {
        try {
          detail = await tourApiService.getPetTourDetail(item.content_id);
        } catch (e) {
          console.warn(`[${item.title}] 상세 조회 실패:`, e.message);
        }
      }

      const summaryTags = detail?.summary_tags || ['#반려견동반'];
      const petDetails = detail?.details || null;

      // 2. DB 존재 여부 확인 (이름 기준)
      const { rows: existing } = await pool.query(
        `SELECT spot_id, name, pet_tour_info FROM spots WHERE name = $1 AND status = 'active' LIMIT 1`,
        [item.title]
      );

      let targetSpotId = null;

      if (existing.length > 0) {
        targetSpotId = existing[0].spot_id;
        if (petDetails) {
          await pool.query(
            `UPDATE spots SET pet_tour_info = $1, first_image = COALESCE(first_image, $2) WHERE spot_id = $3`,
            [JSON.stringify(petDetails), item.image_url, targetSpotId]
          );
        }
      } else {
        // 새 스팟으로 등록
        const lng = item.x || 127.73;
        const lat = item.y || 37.88;
        const { rows: inserted } = await pool.query(
          `INSERT INTO spots (
            name, location, address, categories, kakao_category_name, source,
            content_place, content_tour, first_image, pet_tour_info, region, status
          ) VALUES (
            $1, ST_Point($2, $3)::GEOGRAPHY, $4, ARRAY['공원·광장']::TEXT[], '여행 > 관광,명소', 'admin',
            $5, $6, $7, $8, $9, 'active'
          ) RETURNING spot_id`,
          [
            item.title,
            lng,
            lat,
            item.address || '강원특별자치도 춘천시',
            `${item.title} (한국관광공사 반려동물 동반 가능 관광지)`,
            petDetails?.pet_tour_info || '한국관광공사 인증 반려동물 동반 관광지입니다.',
            item.image_url,
            petDetails ? JSON.stringify(petDetails) : null,
            REGION,
          ]
        );
        targetSpotId = inserted[0].spot_id;
      }

      // 3. 태그 부착
      if (targetSpotId && summaryTags.length > 0) {
        await attachTagsToSpot(targetSpotId, summaryTags, taggerId);
        taggedCount += summaryTags.length;
      }

      syncedCount++;
      console.log(`  ✓ [${item.title}] 태그: ${summaryTags.join(' ')}`);
    }

    console.log(`\n🎉 [동기화 완료] 총 ${syncedCount}개 스팟 동기화, 태그 부착 완료.`);
  } catch (err) {
    console.error('동기화 중 오류 발생:', err);
  } finally {
    await pool.end();
  }
})();
