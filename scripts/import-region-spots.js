require('dotenv').config();

// 서울·춘천 TourAPI 장소 import
//
// TourAPI(KorService2 areaBasedList2)의 관광지·문화시설 목록을 받아 같은 위치의 카카오 장소로 저장한다.
//  - 장소 하나는 카카오 장소 ID 하나: 코스 경유지로 이미 저장된 장소와 중복되지 않는다.
//  - 카카오에서 같은 장소를 찾지 못하면 저장하지 않고 로그에 남긴다.
//  - 저장은 spotService.saveKakaoSpot 으로 하므로 설명·이미지·무장애·반려동물·Odii 보강이 함께 된다.
//    TourAPI contentId 를 넘겨 매칭 검색 없이 상세를 조회하고, 30일 안에 보강된 장소는 다시 부르지 않는다.
//
// 사용법:
//   node scripts/import-region-spots.js --region=chuncheon            # 춘천
//   node scripts/import-region-spots.js --region=seoul --limit=300    # 서울 앞쪽 300곳
//   node scripts/import-region-spots.js --region=seoul --start=300    # 서울 나머지
//   node scripts/import-region-spots.js --region=all --dry-run        # 춘천 → 서울, 저장 없이 매칭만 확인
//   --types=12,14  (12 관광지, 14 문화시설, 28 레포츠, 38 쇼핑)

const axios = require('axios');
const pool = require('../config/db');
const { getSystemAccountId } = require('../utils/systemAccount');
const spotService = require('../services/spotService');
const { inferSpotCategoriesWithFallback } = require('../constants/spotCategoryRules');

const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const PAGE_SIZE = 100;
const MATCH_RADIUS_M = 300;
// 댐·호수·산처럼 넓은 장소는 TourAPI·카카오 좌표가 멀 수 있어, 이름이 정확히 같은 곳만 이 반경까지 찾는다.
const EXACT_MATCH_RADIUS_M = 2000;
const MIN_NAME_SCORE = 70;

// 춘천을 먼저 넣고 서울을 넣는다.
const REGION_TARGETS = {
  chuncheon: { name: '춘천', areaCode: '32', sigunguCode: '13' },
  seoul: { name: '서울', areaCode: '1', sigunguCode: null },
};
const CONTENT_TYPE_NAMES = { 12: '관광지', 14: '문화시설', 28: '레포츠', 38: '쇼핑' };

// 장소 자체가 아닌 부속시설·상업시설로 잘못 매칭되는 카카오 카테고리
// 관광지·문화시설을 카페·식당으로 잘못 잇지 않도록 음식점도 제외 (예: 구봉산 → 구봉산카페쉼터)
const EXCLUDED_KAKAO_CATEGORY_PATTERN = /편의점|주차장|화장실|충전소|숙박|매표소|퀵서비스|식품판매|입출구|^부동산 > (?!빌딩)|^음식점|^의료,건강/;
// 찜질방·스파·온천 등은 산책 장소가 아니어서 제외 (TourAPI가 관광지로 분류해도)
const EXCLUDED_LEISURE_PATTERN = /찜질|사우나|스파|목욕|온천|워터파크/;
const FACILITY_SUFFIX_PATTERN = /(주차장|공중화장실|화장실|입구|출입구|매점|매표소|관리사무소|정류장|점)$/;

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}
const isDryRun = args.includes('--dry-run');
const regionArg = getArg('region', 'all').toLowerCase();
const contentTypes = getArg('types', '12,14').split(',').map((t) => t.trim()).filter(Boolean);
const startArg = Math.max(0, Number.parseInt(getArg('start', '0'), 10) || 0);
const limitArg = Math.max(0, Number.parseInt(getArg('limit', '0'), 10) || 0);
const sleepMs = Math.max(0, Number.parseInt(getArg('sleep', '150'), 10) || 0);

const tourKey = process.env.TOURAPI_SERVICE_KEY || process.env.TOUR_API_SERVICE_KEY;
const kakaoKey = process.env.KAKAO_REST_API_KEY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeName(name = '') {
  return String(name)
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[\s·ㆍ.,'"`\-]/g, '')
    .toLowerCase();
}

// TourAPI 제목 정리: 괄호 안 지역 표기 제거 ("삼악산(춘천)" → "삼악산"), 앞의 지역명 제거
function buildQueries(title, regionName) {
  const base = String(title).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const withoutRegion = base.replace(new RegExp(`^(${regionName}|서울특별시|강원특별자치도|춘천시)\\s+`), '').trim();
  // 지역명·"국립"이 붙어 쓰인 이름 ("춘천봉의산성" → "봉의산성", "국립 용화산자연휴양림" → "용화산자연휴양림")
  const withoutPrefix = withoutRegion.replace(new RegExp(`^(${regionName}|국립)\\s*`), '').trim();
  return [...new Set([base, withoutRegion, withoutPrefix].filter((q) => normalizeName(q).length >= 2))];
}

function getNameScore(expectedName, actualName) {
  const expected = normalizeName(expectedName);
  const actual = normalizeName(actualName);
  if (!expected || !actual) return 0;
  if (expected === actual) return 100;
  if (actual.includes(expected)) {
    if (FACILITY_SUFFIX_PATTERN.test(actual) && !actual.endsWith(expected)) return 0;
    return Math.max(55, 90 - (actual.length - expected.length) * 3);
  }
  if (expected.includes(actual)) return actual.length >= 3 ? 75 : 0;
  return 0;
}

async function fetchRegionItems(target, contentTypeId) {
  const items = [];
  for (let pageNo = 1; ; pageNo += 1) {
    const params = {
      serviceKey: tourKey,
      MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
      MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
      _type: 'json',
      areaCode: target.areaCode,
      contentTypeId,
      arrange: 'A',
      numOfRows: PAGE_SIZE,
      pageNo,
    };
    if (target.sigunguCode) params.sigunguCode = target.sigunguCode;

    const { data } = await axios.get(`${TOUR_API_BASE_URL}/areaBasedList2`, { params, timeout: 15000 });
    const body = data?.response?.body;
    const page = [].concat(body?.items?.item || []);
    items.push(...page);
    if (!page.length || pageNo * PAGE_SIZE >= Number(body?.totalCount || 0)) break;
  }
  return items;
}

async function searchKakao(query, x, y, radius) {
  const { data } = await axios.get(KAKAO_KEYWORD_URL, {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
    params: { query, x, y, radius, sort: 'distance', size: 15 },
    timeout: 5000,
  }).catch(() => ({ data: null }));
  return (data?.documents || []).filter((doc) => !EXCLUDED_KAKAO_CATEGORY_PATTERN.test(String(doc.category_name || '')));
}

// TourAPI 장소와 같은 카카오 장소를 찾는다.
//  1) 좌표 300m 안에서 이름이 맞는 곳 (정확히 같은 이름 우선, 그다음 가까운 곳)
//  2) 300m 안에 이름이 정확히 같은 곳이 없으면 2km 안에서 이름이 정확히 같은 곳
//     (예: 삼악산 → "삼악산 폭포" 대신 "삼악산", 소양강댐처럼 넓은 장소)
async function findKakaoPlace(item, regionName) {
  const x = Number(item.mapx);
  const y = Number(item.mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;

  const queries = buildQueries(item.title, regionName);
  const candidates = [];
  for (const query of queries) {
    for (const doc of await searchKakao(query, x, y, MATCH_RADIUS_M)) {
      const score = getNameScore(query, doc.place_name);
      if (score >= MIN_NAME_SCORE) candidates.push({ doc, score, distance: Number(doc.distance || 0) });
    }
    if (candidates.some((c) => c.score === 100)) break;
  }

  if (!candidates.some((c) => c.score === 100)) {
    for (const query of queries) {
      for (const doc of await searchKakao(query, x, y, EXACT_MATCH_RADIUS_M)) {
        if (getNameScore(query, doc.place_name) === 100) {
          candidates.push({ doc, score: 100, distance: Number(doc.distance || 0) });
        }
      }
      if (candidates.some((c) => c.score === 100)) break;
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score || a.distance - b.distance)[0];
  return best?.doc || null;
}

async function ensureAdminUser() {
  return getSystemAccountId(pool); // 시스템 계정(GilBom) — utils/systemAccount.js
}

async function main() {
  if (!tourKey || !kakaoKey) throw new Error('TOURAPI_SERVICE_KEY와 KAKAO_REST_API_KEY가 필요합니다.');

  const regionKeys = regionArg === 'all' ? ['chuncheon', 'seoul'] : [regionArg];
  for (const key of regionKeys) {
    if (!REGION_TARGETS[key]) throw new Error(`지원하지 않는 --region 값: ${key} (chuncheon | seoul | all)`);
  }

  console.log(`📍 서울·춘천 TourAPI 장소 import`);
  console.log(`- 지역: ${regionKeys.map((k) => REGION_TARGETS[k].name).join(' → ')}`);
  console.log(`- 유형: ${contentTypes.map((t) => CONTENT_TYPE_NAMES[t] || t).join(', ')}`);
  console.log(`- 드라이런: ${isDryRun ? 'ON (저장 안 함)' : 'OFF'}`);

  // 지역 순서(춘천 → 서울)와 유형 순서를 유지한 전체 목록에서 --start/--limit 범위를 자른다.
  let targets = [];
  for (const key of regionKeys) {
    const target = REGION_TARGETS[key];
    for (const contentTypeId of contentTypes) {
      const items = await fetchRegionItems(target, contentTypeId);
      console.log(`- ${target.name} ${CONTENT_TYPE_NAMES[contentTypeId] || contentTypeId}: ${items.length}곳`);
      targets.push(...items.map((item) => ({ item, target, contentTypeId })));
    }
  }
  const seenContentIds = new Set();
  targets = targets.filter(({ item }) => (seenContentIds.has(item.contentid) ? false : seenContentIds.add(item.contentid)));
  if (startArg > 0 || limitArg > 0) {
    targets = targets.slice(startArg, limitArg > 0 ? startArg + limitArg : undefined);
  }
  console.log(`- 처리 대상: ${targets.length}곳 (${startArg + 1}번째부터)\n`);

  const ownerId = isDryRun ? null : await ensureAdminUser();
  const stats = { total: targets.length, created: 0, existing: 0, enriched: 0, skippedRecent: 0, partialQuota: 0, noKakao: 0, excludedLeisure: 0, failed: 0 };
  const noKakao = [];

  for (const [index, { item, target, contentTypeId }] of targets.entries()) {
    const label = `[${startArg + index + 1}] ${target.name} ${item.title}`;
    try {
      if (EXCLUDED_LEISURE_PATTERN.test(item.title)) {
        stats.excludedLeisure += 1;
        console.log(`${label} → 제외 (찜질방·스파·온천)`);
        continue;
      }
      const doc = await findKakaoPlace(item, target.name);
      if (doc && EXCLUDED_LEISURE_PATTERN.test(`${doc.category_name || ''} ${doc.place_name}`)) {
        stats.excludedLeisure += 1;
        console.log(`${label} → 제외 (찜질방·스파·온천: ${doc.place_name})`);
        continue;
      }
      if (!doc) {
        stats.noKakao += 1;
        noKakao.push(`${target.name} ${item.title}`);
        console.log(`${label} → ⚠️ 카카오 장소 없음 (건너뜀)`);
        continue;
      }

      if (isDryRun) {
        console.log(`${label} → ${doc.place_name} (${String(doc.category_name || '').split(' > ').slice(-1)[0]}, ${doc.distance}m)`);
        continue;
      }

      const categories = inferSpotCategoriesWithFallback(doc);
      const saved = await spotService.saveKakaoSpot({
        kakao_place_id: String(doc.id),
        name: doc.place_name,
        kakao_category_name: doc.category_name || null,
        categories: categories.length ? categories : [contentTypeId === '14' ? '전시·문화공간' : '공원·광장'],
        address: doc.road_address_name || doc.address_name || item.addr1 || null,
        x: doc.x,
        y: doc.y,
        tour_api_content_id: String(item.contentid),
      }, ownerId);

      if (saved.is_created) stats.created += 1;
      else stats.existing += 1;
      if (saved.tour_content_status === 'enriched') stats.enriched += 1;
      if (saved.tour_content_status === 'skipped_recently_enriched') stats.skippedRecent += 1;
      if (saved.tour_content_status === 'partial_quota_exceeded') stats.partialQuota += 1;

      console.log(`${label} → ${doc.place_name} (${saved.is_created ? '신규' : '기존'}, ${saved.tour_content_status})`);
    } catch (err) {
      stats.failed += 1;
      console.log(`${label} → ❌ 실패: ${err.message}`);
    }
    if (sleepMs) await sleep(sleepMs);
  }

  console.log('\n=============================================');
  console.log(`처리 ${stats.total}곳 | 신규 ${stats.created} | 기존 ${stats.existing} | 보강 ${stats.enriched}`);
  console.log(`최근 보강되어 건너뜀 ${stats.skippedRecent} | 한도 초과로 보강 미완료 ${stats.partialQuota} | 카카오 장소 없음 ${stats.noKakao} | 찜질방·스파 제외 ${stats.excludedLeisure} | 실패 ${stats.failed}`);
  if (noKakao.length) console.log(`카카오 장소 없음: ${noKakao.join(', ')}`);
  if (stats.partialQuota) console.log('※ 보강 미완료 장소는 다음 실행 때 자동으로 다시 보강됩니다.');
  console.log('=============================================');
}

main()
  .catch((err) => {
    console.error(`장소 import 실패: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
