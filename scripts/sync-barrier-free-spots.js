#!/usr/bin/env node
/**
 * scripts/sync-barrier-free-spots.js
 * ─────────────────────────────────────────────────────────────
 * 한국관광공사 열린관광(KorWithService2) API를 호출하여
 * 지역별 무장애 인증 관광지를 DB spots에 등록/동기화하고,
 * 세부 태그(#무단차통로, #휠체어접근, #장애인화장실, #점자안내 등)를 taggings에 적재한다.
 *
 * 사용법:
 *   node scripts/sync-barrier-free-spots.js                  # 춘천 기본 동기화
 *   node scripts/sync-barrier-free-spots.js --region=서울    # 서울 동기화
 *   node scripts/sync-barrier-free-spots.js --region=all     # 서울 & 춘천 전체 동기화
 *   node scripts/sync-barrier-free-spots.js --limit=100      # 조회 건수 지정
 */

require('dotenv').config();
const pool = require('../config/db');
const tourApiService = require('../services/tourApiService');
const { findTags } = require('../constants/tagAliases');
const {
  resolveRegion,
  inferRegionFromLocation,
  inferSpotCategoriesWithFallback,
} = require('../constants/spotCategoryRules');

// ── CLI 옵션 파싱 ──────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  const match = args.find((a) => a.startsWith(`--${prefix}=`));
  if (match) return match.split('=')[1];
  const idx = args.indexOf(`--${prefix}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const isDryRun = args.includes('--dry-run');
const rawRegion = (getArg('region', '춘천') || '춘천').trim();
const limit = Number.parseInt(getArg('limit', '50'), 10);
const contentTypeId = getArg('contentTypeId', null);

// ── 시스템 태거 보장 (admin 계정) ──────────────────────────────
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

// ── 태그 생성 및 스팟 부착 ────────────────────────────────────
async function attachTagsToSpot(spotId, tagNames, userId) {
  if (!tagNames || tagNames.length === 0) return;
  // 정본 태그만 붙인다 (정본에 없는 이름으로 태그를 새로 만들지 않는다 — constants/tagAliases.js)
  const tags = await findTags(pool, tagNames, 'spot');
  if (!tags.length) return;

  // taggings 등록
  for (const t of tags) {
    await pool.query(
      `INSERT INTO taggings (tag_id, target_type, target_id, user_id)
       VALUES ($1, 'spot', $2, $3)
       ON CONFLICT (tag_id, target_type, target_id, user_id) DO NOTHING`,
      [t.tag_id, spotId, userId]
    );
  }
}

// ── 세부 무장애 태그 자동 도출 ────────────────────────────────
function extractBarrierFreeTags(barrierFreeData) {
  // 열린관광 여부는 barrier_free_info 로 판단하므로 세부 편의시설 태그만 붙인다
  const tags = new Set();

  if (!barrierFreeData || !barrierFreeData.details) {
    return Array.from(tags);
  }

  const d = barrierFreeData.details;

  // 지체장애 편의
  if (d.physical?.wheelchair) {
    const wcStr = String(d.physical.wheelchair);
    if (/대여|렌탈/.test(wcStr)) {
      tags.add('휠체어대여');
    } else {
      tags.add('휠체어접근');
    }
  }
  if (d.physical?.route && !/(불가|어려움|없음)/.test(d.physical.route)) tags.add('무단차통로');
  if (d.physical?.restroom && !/(없음|미설치)/.test(d.physical.restroom)) tags.add('장애인화장실');
  if (d.physical?.parking && !/(없음|불가)/.test(d.physical.parking)) tags.add('장애인주차');
  if (d.physical?.elevator) tags.add('엘리베이터');

  // 영유아 동반
  if (d.infant?.stroller && !/(불가|없음)/.test(d.infant.stroller)) tags.add('유모차대여');
  if (d.infant?.lactation_room && !/(없음|미설치)/.test(d.infant.lactation_room)) tags.add('수유실');

  // 시각장애 편의
  if (d.visual?.braile_block || d.visual?.braile_promotion) tags.add('점자안내');
  if (d.visual?.help_dog) tags.add('안내견동반');
  if (d.visual?.audio_guide) tags.add('시각장애인음성안내');

  // 청각장애 편의
  if (d.hearing?.sign_language || d.hearing?.video_guide) tags.add('수어안내');

  return Array.from(tags);
}

// ── 단일 지역 동기화 실행 ──────────────────────────────────────
async function syncRegion(regionName, taggerId) {
  console.log(`\n♿ [열린관광 스팟 동기화 시작] 대상 지역: ${regionName} (최대 ${limit}개)`);

  const listRes = await tourApiService.getBarrierFreeSpots({
    region: regionName,
    contentTypeId,
    limit,
    page: 1,
  });

  const spots = listRes.spots || [];
  console.log(`한국관광공사 열린관광지 ${spots.length}건 수신 완료`);

  let createdCount = 0;
  let updatedCount = 0;
  let taggedCount = 0;

  for (const item of spots) {
    if (!item.title) continue;

    const contentId = String(item.content_id);
    let detail = null;

    try {
      detail = await tourApiService.getBarrierFreeInfo(contentId);
    } catch (e) {
      console.warn(`  [${item.title}] 상세 조회 실패:`, e.message);
    }

    const bfDetails = detail?.details || null;
    const autoTags = extractBarrierFreeTags(detail);

    if (isDryRun) {
      console.log(`  [DRY-RUN] ${item.title} -> 태그: ${autoTags.map((t) => `#${t}`).join(' ')}`);
      continue;
    }

    // DB 존재 여부 확인 (1차: kakao_place_id 'tour_with_' 기준, 2차: name 기준)
    const kakaoPlaceId = `tour_with_${contentId}`;
    const { rows: existing } = await pool.query(
      `SELECT spot_id, name, barrier_free_info FROM spots
       WHERE kakao_place_id = $1 OR (name = $2 AND status = 'active')
       LIMIT 1`,
      [kakaoPlaceId, item.title]
    );

    let targetSpotId = null;

    if (existing.length > 0) {
      targetSpotId = existing[0].spot_id;
      if (bfDetails) {
        await pool.query(
          `UPDATE spots
           SET barrier_free_info = $1,
               first_image = COALESCE(first_image, $2),
               last_synced_at = NOW()
           WHERE spot_id = $3`,
          [JSON.stringify(bfDetails), item.image_url, targetSpotId]
        );
      }
      updatedCount++;
    } else {
      const lng = item.x || (regionName.includes('춘천') ? 127.73 : 126.97);
      const lat = item.y || (regionName.includes('춘천') ? 37.88 : 37.56);
      const address = item.address || `${regionName} 일대`;

      const regionInfo = inferRegionFromLocation({
        lat,
        lng,
        address: `${address} ${item.title}`,
      });

      const determinedRegion = regionInfo.region || (regionName.includes('춘천') ? '춘천' : '서울');
      const determinedSubRegion = regionInfo.sub_region || null;

      const categories = inferSpotCategoriesWithFallback({
        place_name: item.title,
        name: item.title,
        category_name: item.cat3 || item.cat2 || item.cat1 || '',
      });

      const kakaoCategory = item.content_type_id === '14'
        ? '문화,예술 > 박물관,미술관'
        : item.content_type_id === '39'
          ? '음식점'
          : '여행 > 관광,명소';

      const { rows: inserted } = await pool.query(
        `INSERT INTO spots (
          kakao_place_id, name, location, address, categories, kakao_category_name, source,
          content_place, content_tour, first_image, barrier_free_info, region, sub_region, status, last_synced_at
        ) VALUES (
          $1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[], $7, 'admin',
          $8, $9, $10, $11, $12, $13, 'active', NOW()
        ) RETURNING spot_id`,
        [
          kakaoPlaceId,
          item.title,
          lng,
          lat,
          address,
          categories,
          kakaoCategory,
          `${item.title} (한국관광공사 열린관광지)`,
          '한국관광공사 열린관광(무장애 관광) 인증 관광지입니다.',
          item.image_url,
          bfDetails ? JSON.stringify(bfDetails) : null,
          determinedRegion,
          determinedSubRegion,
        ]
      );
      targetSpotId = inserted[0].spot_id;
      createdCount++;
    }

    // 세부 태그 부착
    if (targetSpotId && autoTags.length > 0) {
      await attachTagsToSpot(targetSpotId, autoTags, taggerId);
      taggedCount += autoTags.length;
    }

    console.log(`  ✓ [${item.title}] 태그: ${autoTags.map((t) => `#${t}`).join(' ')}`);
  }

  return { createdCount, updatedCount, taggedCount };
}

// ── 메인 함수 ──────────────────────────────────────────────────
(async () => {
  let taggerId = null;
  if (!isDryRun) {
    taggerId = await ensureSystemTaggerId();
  }

  try {
    const isAll = rawRegion === 'all' || rawRegion === '전체';
    const targetRegions = isAll ? ['춘천', '서울'] : [rawRegion];

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalTagged = 0;

    for (const r of targetRegions) {
      const { createdCount, updatedCount, taggedCount } = await syncRegion(r, taggerId);
      totalCreated += createdCount;
      totalUpdated += updatedCount;
      totalTagged += taggedCount;
    }

    console.log(`\n🎉 [동기화 완료]`);
    console.log(`  - 신규 등록 스팟: ${totalCreated}개`);
    console.log(`  - 기존 갱신 스팟: ${totalUpdated}개`);
    console.log(`  - 부착된 태그 수: ${totalTagged}건`);
  } catch (err) {
    console.error('동기화 중 오류 발생:', err);
  } finally {
    await pool.end();
  }
})();
