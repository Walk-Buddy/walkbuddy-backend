// ============================================================
// 스팟 대표 사진(first_image) 백필 스크립트
// ------------------------------------------------------------
// 기존에 카카오 검색으로 저장되어 first_image 가 비어 있는 스팟에 대해
// 아래 소스들을 우선순위대로 시도해 대표 사진 URL 을 채운다.
//
//  [사진 확보 소스 체인]
//   1) TourAPI 키워드 검색(searchKeyword2) → firstimage
//   2) TourAPI 좌표 주변 검색(locationBasedList2) → 반경 내 관광지 firstimage
//   3) 한국관광공사 관광사진갤러리(PhotoGalleryService1) → 공모전 고화질 사진
//   4) 카카오 이미지 검색 API(Kakao Search Image) → 실시간 포털/웹 실사진 폴백
//   5) 후기 사진(spot_reviews.photos) 폴백은 DB 조회 시 앱단에서 자동 처리
//
//  [오매칭 방지]
//   - 좌표 주변 검색으로 얻은 사진은 원본 스팟 좌표와의 거리(km)를 계산해
//     [--max-km] 이내일 때만 채택한다. (기본 3km)
//
//  [사용법]
//   node scripts/backfill-spot-first-image.js              # 전체, 실제 반영
//   node scripts/backfill-spot-first-image.js --dry-run    # 미리보기만
//   node scripts/backfill-spot-first-image.js --limit 10   # 앞에서 10개만
//   node scripts/backfill-spot-first-image.js --region 춘천
//   node scripts/backfill-spot-first-image.js --max-km 5
// ============================================================
require('dotenv').config();
const axios = require('axios');
const pool = require('../config/db');
const tourApiService = require('../services/tourApiService');

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// ── CLI 인자 파싱 ────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const DRY_RUN = args.includes('--dry-run');
const LIMIT = getArg('--limit') ? Number(getArg('--limit')) : null;
const REGION = getArg('--region');
const MAX_KM = getArg('--max-km') ? Number(getArg('--max-km')) : 3;
const SLEEP_MS = getArg('--sleep') ? Number(getArg('--sleep')) : 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 두 좌표 사이 거리(km) - 하버사인
function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || isNaN(v))) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 이름 정규화(공백/특수문자 제거, 소문자)
function normalizeName(s) {
  return (s || '').replace(/[\s()[\]{}·・.\-_]/g, '').toLowerCase();
}

// 소스 1: 키워드 검색으로 firstimage 확보
async function findByKeyword(spot) {
  try {
    const r = await tourApiService.searchTourPlaces({ keyword: spot.name, limit: 5 });
    if (!r || !r.spots || r.spots.length === 0) return null;

    const normTarget = normalizeName(spot.name);

    // 1순위: 이름이 정확히 일치하는 항목 중 사진 있는 것
    const exact = r.spots.find(
      (s) => s.image_url && normalizeName(s.title) === normTarget
    );
    if (exact) return { url: exact.image_url, match: 'keyword-exact', contentId: exact.content_id };

    // 2순위: 사진 있는 첫 결과 (좌표 검증은 통과한 것만)
    const withImg = r.spots.find((s) => s.image_url);
    if (withImg) {
      const dist = haversineKm(spot.y, spot.x, withImg.y, withImg.x);
      if (dist <= MAX_KM) {
        return { url: withImg.image_url, match: 'keyword-near', contentId: withImg.content_id, dist };
      }
    }
    return null;
  } catch (e) {
    return { error: e.message };
  }
}

// 소스 2: 좌표 주변 검색으로 firstimage 확보
async function findByLocation(spot) {
  if (spot.x == null || spot.y == null) return null;
  try {
    const r = await tourApiService.getTourSpots({
      latitude: spot.y,
      longitude: spot.x,
      radius: Math.round(MAX_KM * 1000),
      limit: 10,
    });
    const arr = (r && (r.spots || r.items || [])) || [];
    const withImg = arr
      .filter((s) => s.image_url && s.x != null && s.y != null)
      .map((s) => ({ ...s, dist: haversineKm(spot.y, spot.x, s.y, s.x) }))
      .filter((s) => s.dist <= MAX_KM)
      .sort((a, b) => a.dist - b.dist);
    if (withImg[0]) {
      return { url: withImg[0].image_url, match: 'location', contentId: withImg[0].content_id, dist: withImg[0].dist };
    }
    return null;
  } catch (e) {
    return { error: e.message };
  }
}

// 소스 3: 한국관광공사 관광사진갤러리(PhotoGalleryService1) 키워드 검색
async function findByPhotoGallery(spot) {
  try {
    const photos = await tourApiService.getPhotosByKeyword(spot.name, 3);
    if (photos && photos.length > 0 && (photos[0].original || photos[0].thumbnail)) {
      return {
        url: photos[0].original || photos[0].thumbnail,
        match: 'photogallery',
      };
    }
    return null;
  } catch (e) {
    return { error: `gallery: ${e.message}` };
  }
}

// 소스 4: 카카오 이미지 검색(Kakao Search Image API) 폴백
async function findByKakaoImage(spot) {
  if (!KAKAO_KEY) return null;
  try {
    const query = spot.region && !spot.name.includes(spot.region)
      ? `${spot.region} ${spot.name}`
      : spot.name;

    const res = await axios.get('https://dapi.kakao.com/v2/search/image', {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      params: {
        query,
        size: 3,
        sort: 'accuracy',
      },
      timeout: 5000,
    });

    const docs = res.data?.documents || [];
    if (docs.length > 0 && docs[0].image_url) {
      return {
        url: docs[0].image_url,
        match: 'kakao-image',
      };
    }
    return null;
  } catch (e) {
    return { error: `kakao: ${e.message}` };
  }
}

async function main() {
  const where = ['first_image IS NULL'];
  const params = [];
  if (REGION) {
    params.push(REGION);
    where.push(`region = $${params.length}`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : '';

  const { rows: spots } = await pool.query(
    `SELECT spot_id, name, region, sub_region,
            ST_X(location::geometry) AS x,
            ST_Y(location::geometry) AS y
     FROM spots
     ${whereSql}
     ORDER BY created_at
     ${limitSql}`,
    params
  );

  console.log(`\n🔎 first_image 없는 스팟: ${spots.length}개 (max-km=${MAX_KM}, dry-run=${DRY_RUN})\n`);

  let filled = 0, skipped = 0, errored = 0;
  const matched = [];

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    process.stdout.write(`[${i + 1}/${spots.length}] ${spot.name} ... `);

    // 소스 1: TourAPI 키워드 검색
    let result = await findByKeyword(spot);
    if (result && result.error) {
      console.log(`ERR ${result.error}`);
      errored++;
      await sleep(SLEEP_MS);
      continue;
    }
    // 소스 2: TourAPI 좌표 주변 검색
    if (!result) result = await findByLocation(spot);
    if (result && result.error) {
      console.log(`ERR ${result.error}`);
      errored++;
      await sleep(SLEEP_MS);
      continue;
    }
    // 소스 3: 한국관광공사 관광사진갤러리(PhotoGalleryService1) 검색
    if (!result) result = await findByPhotoGallery(spot);
    if (result && result.error) {
      console.log(`ERR ${result.error}`);
      errored++;
      await sleep(SLEEP_MS);
      continue;
    }
    // 소스 4: 카카오 이미지 검색 API (최종 폴백)
    if (!result) result = await findByKakaoImage(spot);
    if (result && result.error) {
      console.log(`ERR ${result.error}`);
      errored++;
      await sleep(SLEEP_MS);
      continue;
    }

    if (!result || !result.url) {
      console.log('❌ 사진 없음');
      skipped++;
      await sleep(SLEEP_MS);
      continue;
    }

    const distLabel = result.dist != null ? ` (${result.dist.toFixed(2)}km)` : '';
    console.log(`✅ ${result.match}${distLabel}`);

    if (!DRY_RUN) {
      await pool.query('UPDATE spots SET first_image = $1 WHERE spot_id = $2', [
        result.url,
        spot.spot_id,
      ]);
    }
    filled++;
    matched.push({ name: spot.name, url: result.url, match: result.match });
    await sleep(SLEEP_MS);
  }

  console.log(`\n──────── 결과 ────────`);
  console.log(`✅ 채움: ${filled}`);
  console.log(`❌ 사진 없음: ${skipped}`);
  console.log(`⚠️  에러: ${errored}`);
  if (DRY_RUN) console.log('(dry-run 이므로 DB 미반영)');
  console.log('');

  await pool.end();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
