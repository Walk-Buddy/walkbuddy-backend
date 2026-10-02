require('dotenv').config();

// TourAPI 관광지(12)·문화시설(14) 장소 적재. 장소마다 개요·무장애(KorWithService2)·반려동물(KorPetTourService2)·이용안내를 함께 조회한다.
// 무장애·반려동물 API 목록에 있는 서울·춘천 관광지·문화시설은 모두 이 목록(KorService2)에 포함돼 있어
// npm run sync:barrier-free / sync:pet 도 이 스크립트를 쓴다. (2026-10 확인: 무장애 283곳·반려동물 37곳 전부 포함)

const axios = require('axios');
const pool = require('../config/db');
const {
  inferRegionFromLocation,
  inferSpotCategoriesWithFallback,
} = require('../constants/spotCategoryRules');
const trafficLog = require('../services/tourTrafficLog');
const { findTags, petSizeTag } = require('../constants/tagAliases');
const tourApiService = require('../services/tourApiService');
const { installDataGoKrKeyFallback } = require('../services/dataGoKrKey');
const { findExistingSpot, linkExternalIds } = require('../utils/spotIdentity');

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
// 콘텐츠 유형: 12 관광지, 14 문화시설 (기본 둘 다)
const contentTypeIds = String(getArg('types', '12,14')).split(',').map((t) => t.trim()).filter(Boolean);
// 이미 TourAPI 정보로 저장된 장소는 상세 호출 없이 건너뛴다 (중간에 멈췄다 다시 돌릴 때 호출 절약)
const skipExisting = args.includes('--skip-existing');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

// 카카오 장소 검색으로 좌표 찾기: 이름이 같은 장소만 (주소가 비어 있는 장소용)
async function findPlaceByName(title, regionName) {
  if (!title || !process.env.KAKAO_REST_API_KEY) return null;
  const norm = (v) => String(v || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
  try {
    const { data } = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
      params: { query: `${regionName} ${norm(title)}`, size: 5 },
      timeout: 5000,
    });
    const doc = (data.documents || []).find((d) => norm(d.place_name) === norm(title)
      && String(d.address_name || '').startsWith(regionName === '춘천' ? '강원' : regionName));
    const point = doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
    return point && isKoreaCoordinate(point.lat, point.lng) ? point : null;
  } catch {
    return null;
  }
}

// 카카오 주소 검색으로 좌표 찾기 (TourAPI 좌표가 잘못된 장소용)
async function geocodeAddress(address) {
  if (!address || !process.env.KAKAO_REST_API_KEY) return null;
  try {
    const { data } = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
      params: { query: address },
      timeout: 5000,
    });
    const doc = data.documents?.[0];
    const point = doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
    return point && isKoreaCoordinate(point.lat, point.lng) ? point : null;
  } catch {
    return null;
  }
}

// 목욕·찜질 시설 이름 ('스파이더', '에스파스 루이비통' 같은 이름은 제외하지 않는다)
const BATH_FACILITY_PATTERN = /찜질|사우나|온천|불가마|목욕탕|(?<!에)스파(?![이스])/;

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

// 공공데이터 인증키 일일 한도 초과 시 보조 키(TOURAPI_SERVICE_KEY_FALLBACK)로 자동 전환
const http = installDataGoKrKeyFallback(axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'WalkBuddy-TourAPI-Importer/1.0' },
}));

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

async function fetchSpotIntro(contentId) {
  const items = await callOpenApi(BASE_URL, 'detailIntro2', { contentId, contentTypeId: 12 }, 'KorService2');
  const item = items[0];
  if (!item) return null;
  return {
    parking: item.parking || null,
    chkbabycarriage: item.chkbabycarriage || null,
    chkpet: item.chkpet || null,
    usetime: item.usetime || null,
    restdate: item.restdate || null,
    heritage1: String(item.heritage1 || '0'),
    heritage2: String(item.heritage2 || '0'),
    heritage3: String(item.heritage3 || '0'),
  };
}

// 반려동물 동반 정보는 앱이 읽는 형식(tourApiService.getPetTourDetail 의 details)으로 저장한다.
// IMPORTANT: 예전엔 여기서 다른 키(notes·parking)로 따로 만들어 앱 장소 상세에 동반 안내가 빠졌다.
async function fetchPetTourInfo(contentId) {
  const result = await tourApiService.getPetTourDetail(contentId);
  return result?.has_pet_info ? result.details : null;
}

// ──────────────────────────────────────────────────────────
// 4. AI 기반 분위기·테마 정밀 태그 추론 (Gemini / SWU AI Gateway)
// ──────────────────────────────────────────────────────────
let currentKeyIndex = 0;
function getSwuApiKey() {
  const keys = (process.env.SWU_AI_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length) return '';
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
}

// 허용된 정본 31개 스팟 태그 마스터 (db/schema.sql 기준)
const CANONICAL_SPOT_TAGS = new Set([
  '무단차통로', '휠체어접근', '휠체어대여', '장애인주차', '장애인화장실',
  '엘리베이터', '안내견동반', '시각장애인음성안내', '점자안내', '수어안내',
  '유모차대여', '수유실', '반려동물', '소형견동반', '대형견 동반',
  '반려견배변시설', '반려견놀이터', '화장실', '주차가능', '식수대',
  '벤치·쉼터', 'Odii음성해설', '실시간축제', '포토존', '전통·한옥',
  '낮그늘', '밤산책', '일출명소', '일몰명소', '문화/예술', '역사유적'
]);

async function inferAiThemeTags({ title, categories = [], overview = '' }) {
  const allowedTags = new Set([
    '밤산책', '일몰명소', '일출명소', '포토존', '전통·한옥', '낮그늘', '문화/예술', '역사유적', '벤치·쉼터'
  ]);

  const swuKey = getSwuApiKey();
  if (!swuKey) return [];

  const prompt = `당신은 대한민국 산책·관광 스팟의 태그를 판정하는 전문가입니다.
다음 장소의 정보를 읽고, 아래 [허용 태그 목록] 중에서 이 장소에 명확하게 부합하는 태그만 골라 JSON 배열로 출력하세요.

[허용 태그 목록]
- 밤산책 (야경, 야간 조명, 밤에 방문하기 좋은 곳)
- 일몰명소 (노을, 석양, 해넘이 조망지)
- 일출명소 (일출, 해돋이 명소)
- 포토존 (전망대, 스카이워크, 출렁다리, 케이블카, 기념 조형물, 테마파크, 뷰포인트 사진 명소)
- 전통·한옥 (전통 한옥, 고택, 전통마을, 한국 전통문화)
- 낮그늘 (수목이 우거진 숲, 산림욕장, 나무 그늘길)
- 문화/예술 (미술관, 박물관, 문학관, 전시관, 예술 체험)
- 역사유적 (사찰, 궁, 묘역, 왕릉, 충혼탑, 석탑, 성곽, 사적지, 지정문화재)
- 벤치·쉼터 (휴게 쉼터, 정자, 벤치가 있는 휴식 공간)

[대원칙]
1. 억지로 추측하거나 지어내지 마세요. 장소의 본질적 성격이나 개요에 부합할 때만 선택하세요.
2. 위 허용 태그 외의 다른 단어는 절대 추가하지 마세요.
3. 응답은 마크다운 코드블록 없이 순수 JSON 배열만 출력하세요. 예: ["밤산책", "포토존"]

[장소 정보]
- 장소명: ${title}
- 카테고리: ${categories.join(', ')}
- 개요: ${overview.slice(0, 300)}`;

  try {
    const res = await axios.post(
      'https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/',
      {
        model: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${swuKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    const content = res.data?.choices?.[0]?.message?.content?.trim() || '';
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((t) => allowedTags.has(t));
      }
    }
  } catch (err) {
    // AI 에러 시 fallback
  }
  return [];
}

// ──────────────────────────────────────────────────────────
// 5. 데이터 기반 장소 태그 자동 도출 알고리즘 (하이브리드)
// ──────────────────────────────────────────────────────────
function deriveSpotTags({ title = '', categories = [], overview = '', barrierFree, petTour, intro, aiTags = [] }) {
  const tags = new Set();

  // (1) detailIntro2 공인 운영/편의 데이터 기반
  if (intro) {
    const park = String(intro.parking || '');
    if (/가능|무료|유료|주차장/.test(park) && !/불가|없음/.test(park)) {
      tags.add('주차가능');
    }
    const baby = String(intro.chkbabycarriage || '');
    if (/가능|대여|유료|무료/.test(baby) && !/불가|없음/.test(baby)) {
      tags.add('유모차대여');
    }
    const pet = String(intro.chkpet || '');
    if (/가능/.test(pet) && !/불가|금지|없음/.test(pet)) {
      tags.add('반려동물');
    }
    if (intro.heritage1 === '1' || intro.heritage2 === '1' || intro.heritage3 === '1') {
      tags.add('역사유적');
    }
    const usetime = String(intro.usetime || '');
    if (/상시\s*개방|24시간|야간/.test(usetime)) {
      tags.add('밤산책');
    }
  }

  // (2) 무장애 여행정보 (KorWithService2 - 열린관광 공식 편의시설 태그)
  if (barrierFree) {
    const p = barrierFree.physical || {};
    const v = barrierFree.visual || {};
    const h = barrierFree.hearing || {};
    const i = barrierFree.infant || {};

    if (p.wheelchair) {
      tags.add('휠체어접근');
      const wText = String(p.wheelchair);
      if (/대여|빌려|구비/.test(wText)) {
        tags.add('휠체어대여');
      }
    }
    if (p.route || p.exit || p.handicapetc) {
      tags.add('무단차통로');
      const routeText = `${p.route || ''} ${p.exit || ''} ${p.handicapetc || ''}`;
      if (/휠체어|경사로|턱이\s*없어|완만/.test(routeText)) {
        tags.add('휠체어접근');
      }
    }

    if (p.restroom) {
      tags.add('장애인화장실');
      tags.add('화장실');
    }
    if (p.parking) {
      tags.add('장애인주차');
      tags.add('주차가능');
    }

    if (p.elevator) tags.add('엘리베이터');
    if (i.stroller) tags.add('유모차대여');
    if (i.lactation_room) tags.add('수유실');
    if (v.braile_block || v.braile_promotion) tags.add('점자안내');
    if (v.help_dog) tags.add('안내견동반');
    if (v.audio_guide) tags.add('시각장애인음성안내');
    if (h.sign_language || h.video_guide) tags.add('수어안내');
  }

  // (3) 반려동물 동반정보 (KorPetTourService2 - 반려동물 공식 태그)
  if (petTour) {
    tags.add('반려동물');
    const sizeTag = petSizeTag(petTour.allowed_pet_size);
    if (sizeTag) tags.add(sizeTag);

    const fac = `${petTour.facilities || ''} ${petTour.need_items || ''} ${petTour.etc_info || ''}`;
    if (/배변|봉투|수거함/.test(fac)) tags.add('반려견배변시설');
    if (/놀이터|운동장|펜스/.test(fac)) tags.add('반려견놀이터');
    if (/주차/.test(petTour.facilities || '')) tags.add('주차가능');
  }

  // (4) 지형 및 시설물 팩트 기반 패턴 매칭 (정밀 방어)
  const tText = String(title || '');
  if (/약수터|식수대|음수대/.test(tText)) tags.add('식수대');
  if (/스카이워크|출렁다리|전망대|타워|케이블카/.test(tText)) tags.add('포토존');
  if (/사찰|절|궁|묘역|능|왕릉|충혼탑|비석|석탑|성곽|사적지|생가|추모상|추모비|위령탑/.test(tText) || categories.includes('역사·유적')) {
    tags.add('역사유적');
  }
  if (/문학공원|조각공원|예술공원|미술관|박물관|문학관|전시관|아트센터|도예/.test(tText) || categories.includes('전시·문화공간')) {
    tags.add('문화/예술');
  }
  if (categories.includes('숲·휴양림')) {
    tags.add('낮그늘');
    tags.add('벤치·쉼터');
  }

  // (5) AI 분석 테마 태그 병합 (검증된 정본 31개 태그 풀 일치)
  if (Array.isArray(aiTags)) {
    for (const tag of aiTags) {
      tags.add(tag);
    }
  }

  // 정본 31개 스팟 태그 마스터 일치 태그만 최종 반환
  return Array.from(tags).filter((t) => CANONICAL_SPOT_TAGS.has(t));
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

  // IMPORTANT: 기존 태그는 지우지 않고 추가만 한다.
  // 예전엔 같은 관리자 계정의 태그를 모두 지운 뒤 이번에 도출한 태그만 붙여, 다른 경로(레거시 병합·백필)로
  // 붙은 무장애·편의시설 태그가 다시 실행할 때마다 사라졌다.

  // 정본 태그만 붙인다 (정본에 없는 이름으로 태그를 새로 만들지 않는다 — constants/tagAliases.js)
  const tags = await findTags(client, tagNames, 'spot');
  for (const tag of tags) {
    try {
      await client.query(
        `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
         VALUES ($1, $2, 'spot', $3)
         ON CONFLICT DO NOTHING`,
        [tag.tag_id, spotId, ownerId]
      );
      attached.push(tag.name);
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

      // 콘텐츠 유형별로 페이지를 넘기며 지역 전체(최대 limitPerRegion)를 받는다
      const items = [];
      for (const contentTypeId of contentTypeIds) {
        const typeItems = [];
        for (let pageNo = 1; typeItems.length < limitPerRegion; pageNo += 1) {
          const params = {
            areaCode: target.areaCode,
            numOfRows: Math.min(100, limitPerRegion),
            pageNo,
            arrange: 'O', // 인기/제목순
            contentTypeId,
          };
          if (target.sigunguCode) params.sigunguCode = target.sigunguCode;
          const pageItems = await callOpenApi(BASE_URL, 'areaBasedList2', params, 'KorService2');
          typeItems.push(...pageItems);
          if (pageItems.length < params.numOfRows) break;
        }
        console.log(`   - 유형 ${contentTypeId}: ${Math.min(typeItems.length, limitPerRegion)}개`);
        items.push(...typeItems.slice(0, limitPerRegion));
      }
      console.log(`   총 ${items.length}개 후보 확인. 세부 정보 및 태그 분석 중...`);

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const contentId = String(item.contentid);

        if (seenPlaceIds.has(contentId)) continue;
        seenPlaceIds.add(contentId);

        if (skipExisting && !isDryRun) {
          const { rows: done } = await client.query(
            'SELECT 1 FROM spots WHERE tour_content_id = $1 AND content_tour IS NOT NULL', [contentId]);
          if (done.length) continue;
        }

        let lng = Number(item.mapx);
        let lat = Number(item.mapy);
        const title = (item.title || '').trim();
        const address = (item.addr1 || '') + (item.addr2 ? ` ${item.addr2}` : '');

        // IMPORTANT: TourAPI 좌표가 한국 밖으로 잘못 들어온 장소가 있다 (서울책보고 등이 19.69,117.99).
        // 그대로 저장하면 지도·반경 검색에서 사라지므로 주소로 좌표를 다시 찾고, 못 찾으면 건너뛴다.
        if (!isKoreaCoordinate(lat, lng)) {
          const geocoded = await geocodeAddress(item.addr1 || address) || await findPlaceByName(title, target.name);
          if (!geocoded) {
            console.log(`   [제외] 좌표 오류·주소와 이름으로도 못 찾음: ${title} (${item.mapy}, ${item.mapx})`);
            continue;
          }
          console.log(`   [좌표 보정] ${title}: (${item.mapy}, ${item.mapx}) → (${geocoded.lat}, ${geocoded.lng})`);
          ({ lat, lng } = geocoded);
        }

        // 산책 장소가 아닌 목욕·찜질 시설은 제외 (예: 월드온천24)
        if (BATH_FACILITY_PATTERN.test(title)) {
          console.log(`   [제외] 목욕·찜질 시설: ${title}`);
          continue;
        }

        // 1. 상세 정보 병렬 조회 (개요, 무장애, 반려동물, 운영정보)
        await sleep(sleepMs);
        const [overview, barrierFree, petTour, intro] = await Promise.all([
          fetchSpotOverview(contentId).catch(() => ''),
          fetchBarrierFreeInfo(contentId).catch(() => null),
          fetchPetTourInfo(contentId).catch(() => null),
          fetchSpotIntro(contentId).catch(() => null),
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

        // 3. AI 테마 태그 추론 (Gemini 3.7 Flash)
        const aiTags = await inferAiThemeTags({
          title,
          categories,
          overview,
        }).catch(() => []);

        // 4. 데이터 기반 태그 종합 도출 (운영정보, 무장애, 반려동물, AI테마)
        const autoTags = deriveSpotTags({
          title,
          categories,
          overview,
          barrierFree,
          petTour,
          intro,
          aiTags,
        });

        const rawImg = item.firstimage || item.firstimage2 || null;
        const firstImage = rawImg ? rawImg.replace(/^http:\/\//i, 'https://').trim() : null;
        const isNightTour = autoTags.includes('밤산책');

        if (isDryRun) {
          resultRows.push({
            '지역': determinedRegion,
            '권역/구': determinedSubRegion || '-',
            '스팟명': title,
            '카테고리': categories.join(', ') || '공원·광장',
            '대표사진': firstImage ? 'O' : 'X',
            '태그수': autoTags.length,
            '태그 목록': autoTags.map((t) => `#${t}`).join(' ') || '(없음)',
          });

          console.log(
            `   [${resultRows.length}] [dry-run] ${determinedRegion} (${determinedSubRegion || '-'}) | ${title} | 사진:${firstImage ? 'O' : 'X'} | 태그(${autoTags.map((t) => `#${t}`).join(', ') || '없음'})`
          );
          continue;
        }

        // 5. DB spots 저장 — 이미 있는 장소면 업데이트, 없으면 새로 만든다
        //    확인 순서: TourAPI 번호 → 같은 이름 + 300m (utils/spotIdentity.js)
        const matched = await findExistingSpot(client, { tourContentId: contentId, name: title, lat, lng });
        const values = {
          address: address || null,
          categories,
          kakaoCategory: item.cat3 || item.cat2 || item.cat1 || null,
          overview: overview || null,
          firstImage,
          barrierFree: barrierFree ? JSON.stringify(barrierFree) : null,
          petTour: petTour ? JSON.stringify(petTour) : null,
        };
        let rows;
        if (matched) {
          await linkExternalIds(client, matched.spot_id, { tourContentId: contentId });
          // 이미 있는 장소는 이름·좌표·카테고리를 바꾸지 않고 정보만 보강한다
          ({ rows } = await client.query(
            `UPDATE spots SET
               address = COALESCE(address, $2),
               content_tour = COALESCE($3, content_tour),
               first_image = COALESCE($4, first_image),
               barrier_free_info = COALESCE($5, barrier_free_info),
               pet_tour_info = COALESCE($6, pet_tour_info),
               is_night_tour = is_night_tour OR $7,
               last_synced_at = NOW()
             WHERE spot_id = $1
             RETURNING spot_id`,
            [matched.spot_id, values.address, values.overview, values.firstImage,
             values.barrierFree, values.petTour, isNightTour]
          ));
        } else {
          ({ rows } = await client.query(
            `INSERT INTO spots (
               tour_content_id, name, location, address, categories,
               kakao_category_name, source, region, sub_region,
               content_tour, first_image, barrier_free_info, pet_tour_info, is_night_tour, last_synced_at
             ) VALUES (
               $1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[],
               $7, 'admin', $8, $9,
               $10, $11, $12, $13, $14, NOW()
             )
             RETURNING spot_id`,
            [contentId, title, lng, lat, values.address, values.categories,
             values.kakaoCategory, determinedRegion, determinedSubRegion,
             values.overview, values.firstImage, values.barrierFree, values.petTour, isNightTour]
          ));
        }

        const spotId = rows[0]?.spot_id;

        // 6. 태그 매핑 (taggings)
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
          '대표사진': firstImage ? 'O' : 'X',
          '태그수': attachedCount,
          '주요 태그': autoTags.slice(0, 3).map((t) => `#${t}`).join(' '),
        });

        console.log(
          `   [${resultRows.length}] ${determinedRegion} (${determinedSubRegion || '-'}) | ${title} | 사진:${firstImage ? 'O' : 'X'} | 태그(${autoTags.map((t) => `#${t}`).join(', ') || '없음'})`
        );
      }
    }

    console.log('\n============================================================');
    console.log(isDryRun ? '🔍 [TourAPI 스팟 Dry-Run 분석 결과]' : '🎉 [TourAPI 스팟 적재 결과]');
    console.table(resultRows);
    if (isDryRun) {
      const photoCount = resultRows.filter((r) => r['대표사진'] === 'O').length;
      console.log(`- 분석 대상 스팟: 총 ${resultRows.length}개`);
      console.log(`- 대표사진 보유: ${photoCount}개 (${Math.round((photoCount / (resultRows.length || 1)) * 100)}%)`);
      console.log(`- 태그 1개 이상 부여: ${resultRows.filter((r) => r['태그수'] > 0).length}개`);
    } else {
      console.log(`- 춘천 스팟 적재: ${summary.chuncheon_loaded}건`);
      console.log(`- 서울 스팟 적재: ${summary.seoul_loaded}건`);
      console.log(`- 총 부착된 태그: ${summary.total_tags_attached}개`);
    }
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
