require('dotenv').config();

const axios = require('axios');
const pool = require('../config/db');
const {
  inferRegionFromLocation,
  inferSpotCategoriesWithFallback,
} = require('../constants/spotCategoryRules');
const trafficLog = require('../services/tourTrafficLog');

// ──────────────────────────────────────────────────────────
// 1. CLI 옵션 파싱
// ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  const match = args.find((a) => a.startsWith(`--${prefix}=`));
  if (match) return match.split('=')[1];
  const idx = args.indexOf(`--${prefix}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const isDryRun = args.includes('--dry-run');
const isAll = args.includes('--all');
const limitPerRegion = isAll ? 500 : Number.parseInt(getArg('limit', process.env.TOUARPI_IMPORT_LIMIT || '15'), 10);
const targetRegion = (getArg('region', 'all') || 'all').trim();
const sleepMs = Number.parseInt(getArg('sleep', isAll ? '150' : '200'), 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ──────────────────────────────────────────────────────────
// 2. 서비스 키 및 API 설정
// ──────────────────────────────────────────────────────────
const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const WITH_TOUR_BASE_URL = 'https://apis.data.go.kr/B551011/KorWithService2';
const PET_TOUR_BASE_URL = 'https://apis.data.go.kr/B551011/KorPetTourService2';

function getServiceKey() {
  const key =
    process.env.TOURAPI_SERVICE_KEY ||
    process.env.TOUR_API_SERVICE_KEY ||
    process.env.DURUNUBI_SERVICE_KEY ||
    '';
  return key.replace(/>+$/, '').trim();
}

function requireEnv() {
  const key = getServiceKey();
  if (!key) {
    throw new Error('TOURAPI_SERVICE_KEY(또는 TOUR_API_SERVICE_KEY)가 .env에 설정되지 않았습니다.');
  }
}

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'WalkBuddy-TourAPI-Importer/1.0' },
});

async function callOpenApi(baseUrl, pathname, params, apiName) {
  const serviceKey = getServiceKey();
  const url = new URL(`${baseUrl}/${pathname}`);
  const defaultParams = {
    MobileOS: 'ETC',
    MobileApp: 'WalkBuddy',
    _type: 'json',
  };

  Object.entries({ ...defaultParams, ...params }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, String(v));
    }
  });

  const finalUrl = serviceKey.includes('%')
    ? `${url.toString()}&serviceKey=${serviceKey}`
    : `${url.toString()}&serviceKey=${encodeURIComponent(serviceKey)}`;

  const startedAt = Date.now();
  try {
    const res = await http.get(finalUrl);
    const header = res.data?.response?.header;

    if (header?.resultCode && header.resultCode !== '0000') {
      if (header.resultCode === '03') {
        return []; // 데이터 없음
      }
      throw new Error(`[${header.resultCode}] ${header.resultMsg}`);
    }

    const raw = res.data?.response?.body?.items?.item || [];
    return Array.isArray(raw) ? raw : [raw];
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      throw new Error(`API 인증 실패: TOURAPI_SERVICE_KEY를 확인하세요 (${err.message})`);
    }
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// 3. 세부 정보 조회 (개요, 무장애, 반려동물)
// ──────────────────────────────────────────────────────────
function cleanOverview(text = '') {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchSpotOverview(contentId) {
  const items = await callOpenApi(BASE_URL, 'detailCommon2', { contentId }, 'KorService2');
  const item = items[0];
  return cleanOverview(item?.overview || '');
}

async function fetchBarrierFreeInfo(contentId) {
  const items = await callOpenApi(WITH_TOUR_BASE_URL, 'detailWithTour2', { contentId }, 'KorWithService2');
  const item = items[0];
  if (!item) return null;

  const hasAny = Boolean(
    item.parking || item.route || item.wheelchair || item.restroom ||
    item.elevator || item.stroller || item.lactationroom || item.braileblock ||
    item.helpdog || item.audioguide || item.signguide
  );
  if (!hasAny) return null;

  return {
    physical: {
      parking: item.parking || null,
      route: item.route || null,
      wheelchair: item.wheelchair || null,
      restroom: item.restroom || null,
      elevator: item.elevator || null,
      exit: item.exit || null,
      ticket_office: item.ticketoffice || null,
    },
    visual: {
      braile_block: item.braileblock || null,
      help_dog: item.helpdog || null,
      audio_guide: item.audioguide || null,
      braile_promotion: item.brailepromotion || null,
    },
    hearing: {
      sign_language: item.signguide || item.signlanguage || null,
      video_guide: item.videoguide || null,
    },
    infant: {
      stroller: item.stroller || item.babycarriage || null,
      lactation_room: item.lactationroom || null,
    },
  };
}

async function fetchPetTourInfo(contentId) {
  const items = await callOpenApi(PET_TOUR_BASE_URL, 'detailPetTour2', { contentId }, 'KorPetTourService2');
  const item = items[0];
  if (!item) return null;

  const hasPet = Boolean(
    item.relaAcmdFee || item.relaPosesFclty || item.relaFrnPrvt ||
    item.etcAcmFclty || item.relaRntlPrn || item.acmCheckList
  );
  if (!hasPet) return null;

  return {
    allowed_pet_size: item.acmCheckList || null,
    facilities: item.relaPosesFclty || null,
    notes: item.etcAcmFclty || null,
    parking: item.relaFrnPrvt || null,
  };
}

// ──────────────────────────────────────────────────────────
// 4. 데이터 기반 장소 태그 자동 도출 알고리즘
// ──────────────────────────────────────────────────────────
function deriveSpotTags({ overview, barrierFree, petTour }) {
  const tags = new Set();

  // (1) 무장애 여행정보 (KorWithService2 - 열린관광 공식 편의시설 태그)
  if (barrierFree) {
    const p = barrierFree.physical || {};
    const v = barrierFree.visual || {};
    const h = barrierFree.hearing || {};
    const i = barrierFree.infant || {};

    if (p.wheelchair) tags.add('휠체어접근');
    if (p.route) tags.add('무단차통로');
    if (p.restroom) tags.add('장애인화장실');
    if (p.parking) tags.add('장애인주차');
    if (p.elevator) tags.add('엘리베이터');
    if (i.stroller) tags.add('유모차대여');
    if (i.lactation_room) tags.add('수유실');
    if (v.braile_block || v.braile_promotion) tags.add('점자안내');
    if (v.help_dog) tags.add('안내견동반');
    if (v.audio_guide) tags.add('시각장애인음성안내');
    if (h.sign_language || h.video_guide) tags.add('수어안내');
  }

  // (2) 반려동물 동반정보 (KorPetTourService2 - 반려동물 공식 태그)
  if (petTour) {
    tags.add('반려동물');
    const size = String(petTour.allowed_pet_size || '');
    if (size.includes('대형견') || size.includes('모두') || size.includes('제한없음')) {
      tags.add('대형견 동반');
    } else if (size.includes('소형견') || size.includes('중형견')) {
      tags.add('소형견동반');
    }

    const fac = String(petTour.facilities || '');
    if (fac.includes('배변') || fac.includes('봉투') || fac.includes('수거함')) {
      tags.add('반려견배변시설');
    }
    if (fac.includes('놀이터') || fac.includes('운동장') || fac.includes('펜스')) {
      tags.add('반려견놀이터');
    }
    if (fac.includes('주차') || petTour.parking) tags.add('주차가능');
    if (fac.includes('화장실')) tags.add('화장실');
    if (fac.includes('쉼터') || fac.includes('벤치')) tags.add('벤치·쉼터');
  }

  return Array.from(tags);
}

// ──────────────────────────────────────────────────────────
// 5. DB 관리자 계정 및 태깅 처리
// ──────────────────────────────────────────────────────────
async function ensureAdminUser(client) {
  const { rows } = await client.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`
  );
  if (rows.length) return rows[0].user_id;
  return '00000000-0000-4000-8000-000000000001';
}

async function attachTags(client, spotId, tagNames, ownerId) {
  if (!spotId || !Array.isArray(tagNames) || tagNames.length === 0) return [];
  const attached = [];

  for (const rawName of tagNames) {
    const name = String(rawName).trim().replace(/^#/, '');
    if (!name) continue;

    try {
      // 1. tags 테이블에 태그가 없으면 자동 등록
      const { rows } = await client.query(
        `INSERT INTO tags (name, type, group_name, is_active)
         VALUES ($1, 'spot', '기타', TRUE)
         ON CONFLICT (name, type) DO UPDATE SET is_active = TRUE
         RETURNING tag_id`,
        [name]
      );
      const tagId = rows[0]?.tag_id;

      // 2. taggings 매핑 테이블에 연결
      if (tagId) {
        await client.query(
          `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
           VALUES ($1, $2, 'spot', $3)
           ON CONFLICT DO NOTHING`,
          [tagId, spotId, ownerId]
        );
        attached.push(name);
      }
    } catch (err) {
      // 태그 실패 시 다음 태그 계속 진행
    }
  }

  return attached;
}

// ──────────────────────────────────────────────────────────
// 6. 메인 적재 실행 함수
// ──────────────────────────────────────────────────────────
async function main() {
  requireEnv();

  console.log('🐾 [TourAPI 국문관광정보 스팟 DB 적재 시작]');
  console.log(`- 설정: 지역=${targetRegion}, 지역당 최대=${limitPerRegion}개, dry-run=${isDryRun}\n`);

  let client = null;
  let ownerId = null;
  if (!isDryRun) {
    client = await pool.connect();
    ownerId = await ensureAdminUser(client);
  }

  const summary = {
    chuncheon_loaded: 0,
    seoul_loaded: 0,
    chuncheon_skipped: 0,
    seoul_skipped: 0,
    total_tags_attached: 0,
  };

  try {
    // 대상 지역 구성
    const targets = [];
    const isChuncheon = targetRegion === 'all' || targetRegion.includes('춘천') || targetRegion.toLowerCase().includes('chuncheon');
    const isSeoul = targetRegion === 'all' || targetRegion.includes('서울') || targetRegion.toLowerCase().includes('seoul') || targetRegion.includes('노원');

    if (isChuncheon) {
      targets.push({
        name: '춘천',
        areaCode: '32',
        sigunguCode: '13',
        description: '강원 춘천시 대표 명소/공원',
      });
    }
    if (isSeoul) {
      // 서울 노원구(서울여대 인근) 및 서울 주요 명소
      targets.push({
        name: '서울',
        areaCode: '1',
        sigunguCode: '9', // 노원구 우선
        description: '서울 노원구 및 주요 명소',
      });
      // 서울 전역 추가 (다양한 스팟 확보용)
      targets.push({
        name: '서울',
        areaCode: '1',
        sigunguCode: null,
        description: '서울 전역 대표 명소',
      });
    }

    const seenPlaceIds = new Set();
    const resultRows = [];

    for (const target of targets) {
      console.log(`📍 [${target.name}] 목록 조회 중... (${target.description})`);

      const params = {
        areaCode: target.areaCode,
        numOfRows: limitPerRegion,
        pageNo: 1,
        arrange: 'O', // 인기/제목순
        contentTypeId: 12, // 관광지
      };
      if (target.sigunguCode) params.sigunguCode = target.sigunguCode;

      const items = await callOpenApi(BASE_URL, 'areaBasedList2', params, 'KorService2');
      console.log(`   총 ${items.length}개 후보 확인. 세부 정보 및 태그 분석 중...`);

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const contentId = String(item.contentid);
        const kakaoPlaceId = `tour_${contentId}`;

        if (seenPlaceIds.has(kakaoPlaceId)) continue;
        seenPlaceIds.add(kakaoPlaceId);

        const lng = Number(item.mapx);
        const lat = Number(item.mapy);
        const title = (item.title || '').trim();
        const address = (item.addr1 || '') + (item.addr2 ? ` ${item.addr2}` : '');

        // 유효하지 않은 좌표 건너뜀
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) {
          continue;
        }

        // 1. 상세 정보 병렬 조회 (개요, 무장애, 반려동물)
        await sleep(sleepMs);
        const [overview, barrierFree, petTour] = await Promise.all([
          fetchSpotOverview(contentId).catch(() => ''),
          fetchBarrierFreeInfo(contentId).catch(() => null),
          fetchPetTourInfo(contentId).catch(() => null),
        ]);

        // 2. 카테고리 및 권역 추론
        const categories = inferSpotCategoriesWithFallback({
          place_name: title,
          name: title,
          category_name: item.cat3 || item.cat2 || item.cat1 || '',
          cat1: item.cat1 || '',
          cat2: item.cat2 || '',
          cat3: item.cat3 || '',
        });

        const regionInfo = inferRegionFromLocation({
          lat,
          lng,
          address: `${address} ${title}`,
        });

        const determinedRegion = target.name === '춘천' ? '춘천' : (regionInfo.region || '서울');
        const determinedSubRegion = regionInfo.sub_region || null;

        // 3. 데이터 기반 태그 도출
        const autoTags = deriveSpotTags({ overview, barrierFree, petTour });

        if (isDryRun) {
          resultRows.push({
            '지역': determinedRegion,
            '권역/구': determinedSubRegion || '-',
            '스팟명': title,
            '카테고리': categories.join(', ') || '공원·광장',
            '태그수': autoTags.length,
            '태그 목록': autoTags.map((t) => `#${t}`).join(' ') || '(없음)',
          });
          continue;
        }

        // 4. DB spots 테이블에 영구 저장 (INSERT ... ON CONFLICT DO UPDATE)
        const { rows } = await client.query(
          `INSERT INTO spots (
             kakao_place_id, name, location, address, categories,
             kakao_category_name, source, region, sub_region,
             content_tour, barrier_free_info, last_synced_at
           ) VALUES (
             $1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[],
             $7, 'admin', $8, $9,
             $10, $11, NOW()
           )
           ON CONFLICT (kakao_place_id) DO UPDATE SET
             name = EXCLUDED.name,
             address = COALESCE(EXCLUDED.address, spots.address),
             categories = EXCLUDED.categories,
             region = EXCLUDED.region,
             sub_region = EXCLUDED.sub_region,
             content_tour = COALESCE(EXCLUDED.content_tour, spots.content_tour),
             barrier_free_info = COALESCE(EXCLUDED.barrier_free_info, spots.barrier_free_info),
             last_synced_at = NOW(),
             updated_at = NOW()
           RETURNING spot_id`,
          [
            kakaoPlaceId,
            title,
            lng,
            lat,
            address || null,
            categories,
            item.cat3 || item.cat2 || item.cat1 || null,
            determinedRegion,
            determinedSubRegion,
            overview || null,
            barrierFree ? JSON.stringify(barrierFree) : null,
          ]
        );

        const spotId = rows[0]?.spot_id;

        // 5. 태그 매핑 (taggings)
        let attachedCount = 0;
        if (spotId && autoTags.length > 0) {
          const attached = await attachTags(client, spotId, autoTags, ownerId);
          attachedCount = attached.length;
          summary.total_tags_attached += attachedCount;
        }

        if (determinedRegion === '춘천') summary.chuncheon_loaded += 1;
        else summary.seoul_loaded += 1;

        resultRows.push({
          '지역': determinedRegion,
          '권역/구': determinedSubRegion || '-',
          '스팟명': title,
          '카테고리': categories.join(', '),
          '태그수': attachedCount,
          '주요 태그': autoTags.slice(0, 3).map((t) => `#${t}`).join(' '),
        });

        console.log(
          `   [${resultRows.length}] ${determinedRegion} | ${title} (${autoTags.map((t) => `#${t}`).join(', ') || '태그없음'})`
        );
      }
    }

    console.log('\n============================================================');
    console.log('🎉 [TourAPI 스팟 적재 결과]');
    console.table(resultRows);
    console.log(`- 춘천 스팟 적재: ${summary.chuncheon_loaded}건`);
    console.log(`- 서울 스팟 적재: ${summary.seoul_loaded}건`);
    console.log(`- 총 부착된 태그: ${summary.total_tags_attached}개`);
    console.log('============================================================\n');
  } catch (err) {
    console.error('❌ 적재 실패:', err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    if (!isDryRun) await pool.end();
  }
}

main().catch((err) => {
  console.error('치명적 에러:', err);
  process.exit(1);
});
