const pool = require('../config/db');
const axios = require('axios');
const {
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    getFallbackCategory,
    inferSpotCategoriesWithFallback,
    extractRegionFromAddress,
    inferRegionFromLocation,
    resolveRegion,
} = require('../constants/spotCategoryRules');
const tourApiService = require('./tourApiService');
const odiiService = require('./odiiService');
const trafficLog = require('./tourTrafficLog');
const { getQuotaErrorCount } = require('./dataGoKrKey');
const { isLegacyPlaceId, legacyContentId, findKakaoPlaceNear, isSamePlaceName } = require('../utils/kakaoPlaceMatch');
const { findExistingSpot, linkExternalIds, toKakaoPlaceId, toTourContentId } = require('../utils/spotIdentity');
const { findTags, petSizeTag } = require('../constants/tagAliases');
const { getSystemAccountId } = require('../utils/systemAccount');

const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const TOUR_API_MATCH_RADIUS = Number(process.env.TOUR_API_MATCH_RADIUS || 300);
const TOUR_API_FALLBACK_MATCH_RADIUS = 500;
// 이 기간 안에 TourAPI 보강을 마친 기존 스팟은 다시 저장돼도 보강 호출을 생략한다.
// (두루누비 import 재실행, 같은 스팟을 공유하는 인접 코스에서 반복 호출 방지)
const TOUR_ENRICH_REFRESH_DAYS = Number(process.env.TOUR_ENRICH_REFRESH_DAYS || 30);

function sanitizeText(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]*>/g, '')          // HTML 태그 제거
        .replace(/&[a-zA-Z0-9#]+;/g, ' ') // &nbsp;, &amp; 등 HTML 엔티티 제거
        .replace(/[\r\t]+/g, ' ')         // 탭/개행 정규화
        .replace(/\s{2,}/g, ' ')          // 다중 공백 단일화
        .trim();
}

/**
 * 앱은 카카오 ID가 없는 TourAPI 장소를 kakao_place_id = "tour:<contentId>" 로 저장 요청한다.
 * 이대로 저장하면 같은 장소가 카카오 스팟과 따로 생기므로, 같은 위치의 카카오 장소를 찾아 카카오 ID로 바꾼다.
 * 찾지 못하면 요청 그대로 저장한다. (contentId 는 tour_api_content_id 로 넘겨 TourAPI 보강에 쓴다)
 */
async function normalizeLegacyPlaceId(body) {
    if (!isLegacyPlaceId(body.kakao_place_id) || body.kakao_place_id == null) return body;

    const contentId = legacyContentId(body.kakao_place_id);
    const doc = await findKakaoPlaceNear({ name: body.name, x: body.x, y: body.y, kakaoKey: getKakaoRestApiKey() })
        .catch(() => null);
    if (!doc) {
        return { ...body, tour_api_content_id: body.tour_api_content_id || contentId };
    }

    const categories = inferSpotCategoriesWithFallback(doc);
    return {
        ...body,
        kakao_place_id: String(doc.id),
        name: doc.place_name,
        kakao_category_name: doc.category_name || body.kakao_category_name || null,
        categories: categories.length ? categories : body.categories,
        address: doc.road_address_name || doc.address_name || body.address,
        x: doc.x,
        y: doc.y,
        tour_api_content_id: body.tour_api_content_id || contentId,
    };
}

function getTourApiServiceKey() {
    return process.env.TOUR_API_SERVICE_KEY || process.env.TOURAPI_SERVICE_KEY;
}

function normalizeSpotCategoriesInput(categories) {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    return [...new Set(categories.map(c => String(c).trim()).filter(Boolean))];
}

function getKakaoAddress(document) {
    return document.road_address_name || document.address_name || null;
}

function getKakaoRestApiKey() {
    return process.env.KAKAO_REST_API_KEY;
}

function normalizeTourApiItems(item) {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
}

function normalizePlaceName(name = '') {
    return String(name)
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, '')
        .replace(/[·ㆍ.,'"]/g, '')
        .toLowerCase();
}

// IMPORTANT: 단순 포함 비교를 쓰면 '오목교'가 '올리브영 오목교지하철역점'과 같은 장소로 매칭돼
// 매장의 반려동물·무장애 정보가 붙었다. 덧붙은 말이 지점·부속시설 이름이면 다른 장소로 본다. (utils/kakaoPlaceMatch.js)
function isSameTourPlace(kakaoName, tourTitle) {
    return isSamePlaceName(kakaoName, tourTitle);
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
    const toRad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
    return 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function cleanTourOverview(overview = '') {
    return String(overview)
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

async function fetchTourLocationCandidates({ lng, lat, radius }) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey) return [];

    const api = 'KorService2';
    const pathname = 'locationBasedList2';
    const params = {
        MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
        MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
        _type: 'json',
        arrange: 'E',
        mapX: lng,
        mapY: lat,
        radius,
        numOfRows: 20,
        pageNo: 1,
    };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: { serviceKey, ...params },
        });

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;

        // 실시간 OpenAPI 트래픽 로그 기록 (공사 서버 호출 증빙)
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

                return normalizeTourApiItems(item);
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        // 429(rate limit) 등 일시적 오류 시 throw 하지 않고 빈 배열 반환.
        // → 매칭 실패로 처리되어 다음 폴백(키워드/기존 contentId)으로 진행되게 하여
        //   enrich 전체가 죽는 것을 방지한다.
        return [];
    }
}

async function fetchTourKeywordCandidates(keyword) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey || !keyword) return [];

    const api = 'KorService2';
    const pathname = 'searchKeyword2';
    const params = {
        MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
        MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
        _type: 'json',
        keyword: keyword.trim(),
        numOfRows: 10,
        pageNo: 1,
    };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: { serviceKey, ...params },
        });

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;

        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

        return normalizeTourApiItems(item);
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        return [];
    }
}

async function findTourApiMatchByContentId(contentId) {
    if (!contentId) return null;
    return { contentid: String(contentId), title: null, dist: null };
}

async function fetchTourOverview(contentId) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey || !contentId) return null;

        const api = 'KorService2';
    const pathname = 'detailCommon2';
    // KorService2(v4.x)는 overview·firstimage를 기본으로 내려준다.
    // 예전 firstImageYN/overviewYN 파라미터를 붙이면 INVALID_REQUEST_PARAMETER_ERROR(resultCode 10)로 실패한다.
    const params = { _type: 'json', contentId };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: {
                serviceKey,
                MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
                MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
                _type: 'json',
                contentId,
            },
        });

        // 오류 응답은 { resultCode, resultMsg } 형태로 header 없이 온다.
        if (response.data?.resultCode && response.data.resultCode !== '0000') {
            throw new Error(`${response.data.resultMsg || 'TourAPI 오류'} (${response.data.resultCode})`);
        }

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;
        const detail = normalizeTourApiItems(item)[0];

        // 실시간 OpenAPI 트래픽 로그 기록 (공사 서버 호출 증빙)
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

        // overview(개요) + firstImage(대표 이미지 URL) 를 함께 반환한다.
        return {
            overview: cleanTourOverview(detail?.overview || ''),
            firstImage: detail?.firstimage || detail?.firstimage2 || null,
        };
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        throw err;
    }
}

// 관광공사 응답에서 세부 태그 자동 도출
function extractTourTags({ overview, barrierFreeInfo, petTourInfo, odiiGuide }) {
    const tags = new Set();

    // 1. Odii 오디오 가이드 음원/스크립트 연동 시에만 Odii음성해설 태그 부착
    if (odiiGuide?.audio_url || odiiGuide?.script) {
        tags.add('Odii음성해설');
    }

    // 2. 무장애 편의시설 (KorWithService2) 세부 태그
    if (barrierFreeInfo?.has_barrier_free_info && barrierFreeInfo.details) {
        const d = barrierFreeInfo.details;
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
        if (d.infant?.stroller && !/(불가|없음)/.test(d.infant.stroller)) tags.add('유모차대여');
        if (d.infant?.lactation_room && !/(없음|미설치)/.test(d.infant.lactation_room)) tags.add('수유실');
        if (d.visual?.braile_block || d.visual?.braile_promotion) tags.add('점자안내');
        if (d.visual?.help_dog) tags.add('안내견동반');
        if (d.visual?.audio_guide) tags.add('시각장애인음성안내');
        if (d.hearing?.sign_language || d.hearing?.video_guide) tags.add('수어안내');
    }

    // 3. 반려동물 동반 (KorPetTourService2) 세부 태그
    if (petTourInfo?.has_pet_info) {
        tags.add('반려동물');
        const petDetails = petTourInfo.details || {};
        const sizeTag = petSizeTag(petDetails.allowed_pet_size);
        if (sizeTag) tags.add(sizeTag);

        const facilityStr = `${petDetails.facilities || ''} ${petDetails.etc_info || ''}`;
        if (/배변|배변봉투|배변시설|수거함/i.test(facilityStr) && !/(없음|미설치)/.test(facilityStr)) {
            tags.add('반려견배변시설');
        }
        if (/놀이터|운동장|안전문|펜스/i.test(facilityStr) && !/(없음|미설치)/.test(facilityStr)) {
            tags.add('반려견놀이터');
        }
        if ((facilityStr.includes('주차') || facilityStr.includes('주차장')) && !/(주차\s*불가|주차장\s*없음)/.test(facilityStr)) tags.add('주차가능');
        if (facilityStr.includes('화장실') && !/(화장실\s*없음)/.test(facilityStr)) tags.add('화장실');
        if ((facilityStr.includes('쉼터') || facilityStr.includes('벤치')) && !/(쉼터\s*없음)/.test(facilityStr)) tags.add('벤치·쉼터');
    }

    return Array.from(tags);
}

// ──────────────────────────────────────────────────────────
// 자동 태깅용 "시스템 태깅 계정" 보장
//   taggings.user_id 는 NOT NULL + FK(users) 이므로 자동 태깅은 반드시
//   실제 user_id 가 필요하다. 관리자 계정이 있으면 그 계정을, 없으면
//   'system-tagger' 시드 계정을 1회 생성·재사용한다.
// ──────────────────────────────────────────────────────────

async function ensureSystemTaggerId() {
    // 자동 태그는 시스템 계정(GilBom)으로 단다 (utils/systemAccount.js)
    return getSystemAccountId(pool);
}

// 스팟에 세부 태그 일괄 자동 부착
async function attachTagsToSpot(spotId, tagNames, userId) {
    if (!spotId || !Array.isArray(tagNames) || tagNames.length === 0) return;
    const cleanNames = tagNames.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
    if (cleanNames.length === 0) return;

        try {
        // 0. 실제 taggings.user_id 확보 (자동 태깅은 시스템 계정으로 귀속)
        //    → 기존 userId || null 은 NOT NULL/FK 위반으로 조용히 실패하던 버그
        const taggerId = userId || await ensureSystemTaggerId();
        if (!taggerId) {
            console.error('attachTagsToSpot skipped: no valid user_id for tagging');
            return;
        }

        // 1. 정본 태그만 붙인다 (정본에 없는 이름으로 태그를 새로 만들지 않는다 — constants/tagAliases.js)
        const tagsToAttach = await findTags(pool, cleanNames, 'spot');

        // 2. taggings 테이블에 일괄 등록
        for (const tag of tagsToAttach) {
            await pool.query(
                `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
                 VALUES ($1, $2, 'spot', $3)
                 ON CONFLICT DO NOTHING`,
                [tag.tag_id, spotId, taggerId]
            );
        }
    } catch (err) {
        console.error('attachTagsToSpot error:', err.message);
    }
}

async function searchKakaoSpotCandidates({ keyword, category, size = 15 }) {
    const kakaoRestApiKey = getKakaoRestApiKey();
    if (!kakaoRestApiKey) {
        const err = new Error('Kakao REST API key is not configured');
        err.status = 500;
        throw err;
    }

    if (!keyword && !category) {
        const err = new Error('keyword or category is required');
        err.status = 400;
        throw err;
    }

    if (category && !SPOT_CATEGORIES.includes(category)) {
        const err = new Error('unsupported spot category');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    const rules = keyword ? [{ query: keyword }] : SPOT_CATEGORY_SEARCH_RULES[category];
    const allDocuments = [];

    for (const rule of rules) {
        const params = { query: rule.query, size, page: 1 };
        if (rule.category_group_code) params.category_group_code = rule.category_group_code;

        const kakaoResponse = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
            params,
            headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
        });
        allDocuments.push(...(kakaoResponse.data.documents || []));
    }

    const uniqueKakaoSpotMap = new Map();
    for (const document of allDocuments) {
        let categories = inferSpotCategoriesWithFallback(document);
        // 키워드 검색 시에는 일상적인 장소(식당, 카페, 편의점, 약국, 정류장, 주차장, 건물 등)도 배제하지 않고 포함
        if (categories.length === 0) {
            const fallbackCat = getFallbackCategory(document.category_name || '');
            categories = fallbackCat ? [fallbackCat] : ['공원·광장'];
        }
        if (category && !categories.includes(category)) continue;
        uniqueKakaoSpotMap.set(document.id, {
            kakao_place_id: document.id,
            name: document.place_name,
            kakao_category_name: document.category_name,
            categories,
            address: getKakaoAddress(document),
            x: Number(document.x),
            y: Number(document.y),
            distance: document.distance ? Number(document.distance) : null,
        });
    }

    return Array.from(uniqueKakaoSpotMap.values());
}

async function enrichKakaoSpotTourContent(spot, userId) {
    const result = {
        tour_content_enriched: false,
        tour_content_status: 'skipped',
        tour_content_match: null,
        barrier_free_enriched: false,
        pet_tour_enriched: false,
        attached_tags: [],
    };

    if (!getTourApiServiceKey()) {
        result.tour_content_status = 'skipped_missing_tour_api_key';
        return { spot, ...result };
    }

    const lng = Number(spot.x);
    const lat = Number(spot.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        result.tour_content_status = 'skipped_invalid_location';
        return { spot, ...result };
    }

    // 보강 도중 일일 한도 초과가 있었는지 확인하기 위한 기준값
    const quotaErrorsBefore = getQuotaErrorCount();

    try {
        // Odii 오디오 가이드 검색을 병렬로 함께 시작
        const odiiPromise = odiiService.findBestOdiiGuide({
            name: spot.name,
            x: lng,
            y: lat,
        }).catch(() => null);

        // 요청으로 받은 contentId → 이전 보강에서 저장해 둔 contentId 순으로 쓰고,
        // 둘 다 없을 때만 위치·키워드 검색으로 매칭한다.
        let matched = await findTourApiMatchByContentId(spot.tour_api_content_id || spot.tour_content_id);
        let candidates = [];

        if (!matched) {
            candidates = await fetchTourLocationCandidates({
                lng,
                lat,
                radius: TOUR_API_MATCH_RADIUS,
            });

            matched = candidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0))[0];
        }

        if (!matched && TOUR_API_MATCH_RADIUS < TOUR_API_FALLBACK_MATCH_RADIUS) {
            candidates = await fetchTourLocationCandidates({
                lng,
                lat,
                radius: TOUR_API_FALLBACK_MATCH_RADIUS,
            });
            matched = candidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0))[0];
        }

        // 3차 폴백: 키워드 검색 기반 매칭 (관광지 위치가 카카오 좌표와 조금 다르거나 반경 밖인 경우)
        if (!matched) {
            const kwCandidates = await fetchTourKeywordCandidates(spot.name);
            // 이름이 같은 다른 지역 장소와 매칭되지 않도록 2km 안만 쓴다
            matched = kwCandidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .filter(candidate => haversineDistanceMeters(lat, lng, Number(candidate.mapy), Number(candidate.mapx)) <= 2000)
                .sort((a, b) => {
                    const distA = Math.hypot(Number(a.mapx || 0) - lng, Number(a.mapy || 0) - lat);
                    const distB = Math.hypot(Number(b.mapx || 0) - lng, Number(b.mapy || 0) - lat);
                    return distA - distB;
                })[0];
        }

        const updateClauses = [];
        const updateParams = [spot.spot_id];

                let overview = null;
        let tourFirstImage = null;
        // extractTourTags 는 if 블록 밖에서 호출되므로, 반드시 바깥 스코프에서 선언해야 한다.
        // (블록 안 const 로 선언하면 매칭 실패 시 ReferenceError → enrich 전체 실패)
        let barrierFreeInfo = null;
        let petTourInfo = null;

        if (matched?.contentid) {
            const contentId = String(matched.contentid);
            result.tour_content_match = {
                content_id: contentId,
                title: matched.title,
                distance: matched.dist == null ? null : Number(matched.dist),
            };

            // 1. 한국관광공사 전방위 API(개요, 무장애, 반려동물) 병렬 조회
            const [overviewResult, barrierFreeResult, petTourResult] = await Promise.allSettled([
                fetchTourOverview(contentId),
                tourApiService.getBarrierFreeInfo(contentId),
                tourApiService.getPetTourDetail(contentId),
            ]);

            const tourDetail = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
            overview = tourDetail?.overview || null;
            barrierFreeInfo = barrierFreeResult.status === 'fulfilled' ? barrierFreeResult.value : null;
            petTourInfo = petTourResult.status === 'fulfilled' ? petTourResult.value : null;

            tourFirstImage = matched.firstimage || matched.firstimage2 || tourDetail?.firstImage || null;

            if (barrierFreeInfo?.has_barrier_free_info) {
                updateParams.push(JSON.stringify(barrierFreeInfo.details));
                updateClauses.push(`barrier_free_info = $${updateParams.length}`);
                result.barrier_free_enriched = true;
            }

            if (petTourInfo?.has_pet_info && petTourInfo.details) {
                updateParams.push(JSON.stringify(petTourInfo.details));
                updateClauses.push(`pet_tour_info = $${updateParams.length}`);
                result.pet_tour_enriched = true;
            } else if (petTourInfo?.has_pet_info) {
                result.pet_tour_enriched = true;
            }

            if (tourFirstImage && !spot.first_image) {
                updateParams.push(tourFirstImage);
                updateClauses.push(`first_image = $${updateParams.length}`);
            }
        } else {
            result.tour_content_status = 'no_matching_tour_place';
        }

        // Odii 오디오 가이드 결과 수신
        const odiiGuide = await odiiPromise;
        const sanitizedOdii = sanitizeText(odiiGuide?.script);
        const sanitizedOverview = sanitizeText(overview);

        // 둘 다 있으면 병합, 둘 중 하나만 있어도 적재
        let combinedTourContent = null;
        if (sanitizedOdii && sanitizedOverview) {
            combinedTourContent = `[스토리 해설]\n${sanitizedOdii}\n\n[관광 정보 개요]\n${sanitizedOverview}`;
        } else if (sanitizedOdii) {
            combinedTourContent = sanitizedOdii;
        } else if (sanitizedOverview) {
            combinedTourContent = sanitizedOverview;
        }

        if (combinedTourContent && !spot.content_tour) {
            updateParams.push(combinedTourContent);
            updateClauses.push(`content_tour = $${updateParams.length}`);
            result.tour_content_enriched = true;
        }

        let updatedSpot = spot;
        if (updateClauses.length > 0) {
            const updatedResult = await pool.query(
                `UPDATE spots
                 SET ${updateClauses.join(', ')}
                 WHERE spot_id = $1
                 RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                           recommend_pct, content_tour, barrier_free_info, pet_tour_info, first_image,
                           ST_X(location::GEOMETRY) AS x,
                           ST_Y(location::GEOMETRY) AS y`,
                updateParams
            );
            if (updatedResult.rows[0]) {
                updatedSpot = updatedResult.rows[0];
            }
        }

        // 3. 세부 기능별 태그 자동 도출 및 일괄 부착
        const autoTags = extractTourTags({ overview, barrierFreeInfo, petTourInfo, odiiGuide });
        if (autoTags.length > 0) {
            await attachTagsToSpot(updatedSpot.spot_id, autoTags, userId);
            result.attached_tags = autoTags;
        }

        result.tour_content_status = (result.tour_content_enriched || result.barrier_free_enriched || result.pet_tour_enriched)
            ? 'enriched'
            : 'matched_without_new_content';

        // 보강 완료 기록. TourAPI에 없는 장소도 기록해서 매칭 검색을 반복하지 않는다.
        // 일일 한도 초과로 일부 호출이 실패했다면 기록하지 않아 다음 저장 때 다시 시도한다.
        if (getQuotaErrorCount() === quotaErrorsBefore) {
            await pool.query(
                // 다른 장소가 이미 가진 TourAPI 번호는 넣지 않는다 (uix_spots_tour_content_id)
                `UPDATE spots SET tour_enriched_at = NOW(),
                        tour_content_id = CASE
                            WHEN $2::text IS NULL THEN tour_content_id
                            WHEN EXISTS (SELECT 1 FROM spots o WHERE o.tour_content_id = $2 AND o.spot_id <> $1) THEN tour_content_id
                            ELSE $2 END
                  WHERE spot_id = $1`,
                [updatedSpot.spot_id, matched?.contentid ? String(matched.contentid) : null]
            );
        } else {
            result.tour_content_status = 'partial_quota_exceeded';
        }

        return {
            spot: {
                ...updatedSpot,
                x: Number(updatedSpot.x),
                y: Number(updatedSpot.y),
                recommend_pct: updatedSpot.recommend_pct == null ? null : Number(updatedSpot.recommend_pct),
            },
            ...result,
        };
    } catch (err) {
        console.error('[TourAPI multi-enrich failed]', err.message);
        result.tour_content_status = 'tour_api_error';
        return { spot, ...result };
    }
}

// ──────────────────────────────────────────────────────────────────────
// 스팟 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpots = async (query) => {
    const {
        category,
        tag_ids,
        tag_name,
        tag_names,
        min_recommend_pct,
        region,
        sub_region,
        sort = 'latest',
        page = 1,
        limit = 20,
    } = query;

    const rawKeyword = Array.isArray(query.keyword ?? query.q) ? (query.keyword ?? query.q)[0] : (query.keyword ?? query.q);
    const keyword = rawKeyword === undefined || rawKeyword === null ? null : String(rawKeyword).trim();

                const offset = (Number(page) - 1) * Number(limit);
    // 탐색 기본 목록에서는 단순 un-enriched 카카오 임시 핀(투어/무장애 정보 및 태그가 없는 장소)을 제외한다.
    // 단, 공식 코스 경유지로 연결된 스팟은 정보가 비어 있어도 노출한다.
    // (예: 춘천 봄내길 코스의 카카오 스팟 — TourAPI 일일 쿼터 소진 시에도 코스와 함께 보여야 함)
    const whereConditions = ["s.status = 'active'"];
    if (!query.tag_ids && !query.tag_name && !query.tag_names && !query.category && !query.keyword && !query.q) {
        whereConditions.push(`(
            s.source <> 'kakao'
            OR s.content_tour IS NOT NULL
            OR s.barrier_free_info IS NOT NULL
            OR EXISTS (SELECT 1 FROM taggings tg WHERE tg.target_id = s.spot_id)
            OR EXISTS (SELECT 1 FROM course_waypoints cw WHERE cw.spot_id = s.spot_id)
        )`);
    }
    const queryValues = [];

    // 정렬 매핑
    const orderMap = {
        recommend: 's.recommend_pct DESC NULLS LAST, s.created_at DESC',
        recommend_pct: 's.recommend_pct DESC NULLS LAST, s.created_at DESC',
        name: 's.name ASC, s.created_at DESC',
        latest: 's.created_at DESC',
    };
    const orderBySql = orderMap[sort] || 's.created_at DESC';

    // 지역 필터
    if (region && String(region).trim()) {
        const reg = String(region).trim();
        const normalizedReg = reg.toLowerCase();
        if (!['전국', '전체', 'all'].includes(normalizedReg)) {
            if (['seoul', '서울', '서울특별시'].includes(normalizedReg) || reg === '서울' || reg === '서울특별시') {
                queryValues.push('서울');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else if (
                ['chuncheon', '춘천', '춘천시', '강원', '강원도', '강원특별자치도', 'gangwon'].includes(normalizedReg) ||
                ['춘천', '춘천시', '강원', '강원도', '강원특별자치도'].includes(reg)
            ) {
                queryValues.push('춘천');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else {
                queryValues.push(`%${reg}%`);
                whereConditions.push(`(s.sub_region ILIKE $${queryValues.length} OR s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length})`);
            }
        }
    }

    // 세부 권역 필터
    if (sub_region && String(sub_region).trim()) {
        const sub = String(sub_region).trim();
        if (!['전체', 'all'].includes(sub.toLowerCase()) && sub !== '전체') {
            queryValues.push(`%${sub}%`);
            whereConditions.push(`(s.sub_region ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length})`);
        }
    }

    // 카테고리 필터
    if (category) {
        if (!SPOT_CATEGORIES.includes(category)) {
            const err = new Error('unsupported spot category');
            err.status = 400;
            err.supported_categories = SPOT_CATEGORIES;
            throw err;
        }
        queryValues.push(category);
        whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
    }

    // 키워드 검색 (스팟명, 주소, 세부권역)
    if (keyword) {
        queryValues.push(`%${keyword}%`);
        whereConditions.push(`(s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length} OR s.sub_region ILIKE $${queryValues.length})`);
    }

    // 태그 ID 목록 검색 (UUID) — 그룹 확장 없이 AND(교집합) 매칭
    if (tag_ids) {
        const tagIdList = (Array.isArray(tag_ids) ? tag_ids.join(',') : tag_ids)
            .split(',').map(t => t.trim()).filter(Boolean);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (tagIdList.some(t => !uuidPattern.test(t))) {
            const err = new Error('tag_ids must be comma-separated UUID values');
            err.status = 400; throw err;
        }
        if (tagIdList.length > 0) {
            queryValues.push(tagIdList); const tagIdx = queryValues.length;
            queryValues.push(tagIdList.length); const countIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND tg.tag_id = ANY($${tagIdx}::UUID[])
                    GROUP BY tg.target_id
                    HAVING COUNT(DISTINCT tg.tag_id) = $${countIdx}
                )
            `);
        }
    }

    // 태그 이름(tag_name / tag_names) 검색 지원 — 그룹 확장 없이 AND(교집합) 매칭
    const targetTagNames = tag_name || tag_names;
    if (targetTagNames) {
        const tagNameList = (Array.isArray(targetTagNames) ? targetTagNames.join(',') : targetTagNames)
            .split(',')
            .map(t => t.trim().replace(/^#/, ''))
            .filter(Boolean);

        if (tagNameList.length > 0) {
            queryValues.push(tagNameList);
            const tagIdx = queryValues.length;
            queryValues.push(tagNameList.length);
            const countIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id
                    FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND t.name = ANY($${tagIdx}::TEXT[])
                    GROUP BY tg.target_id
                    HAVING COUNT(DISTINCT t.name) >= $${countIdx}
                )
            `);
        }
    }

    if (min_recommend_pct) {
        const pct = Number(min_recommend_pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            const err = new Error('min_recommend_pct must be a number between 0 and 100');
            err.status = 400; throw err;
        }
        queryValues.push(pct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

    const countResult = await pool.query(
        `SELECT COUNT(DISTINCT s.spot_id) AS total FROM spots s WHERE ${whereConditions.join(' AND ')}`,
        queryValues
    );

    queryValues.push(Number(limit)); const limitIdx = queryValues.length;
    queryValues.push(offset);        const offsetIdx = queryValues.length;

        const spotsResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.region, s.sub_region, s.recommend_pct,
            s.barrier_free_info, s.pet_tour_info, s.is_night_tour,
            s.first_image,
            -- 후기 사진 폴백: 이 장소의 후기 중 사진이 있는 가장 최근 후기의 첫 사진 key
            (
                SELECT sr.photos[1]
                FROM spot_reviews sr
                WHERE sr.spot_id = s.spot_id
                  AND sr.status = 'active'
                  AND sr.photos IS NOT NULL
                  AND array_length(sr.photos, 1) > 0
                ORDER BY sr.created_at DESC
                LIMIT 1
            ) AS review_photo_url,
            ST_X(s.location::GEOMETRY) AS x,
            ST_Y(s.location::GEOMETRY) AS y,
            s.content_place IS NOT NULL AS has_content_place,
            s.content_history IS NOT NULL AS has_content_history,
            s.content_tour IS NOT NULL AS has_content_tour,
            s.created_at,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
            ) AS tags
        FROM spots s
        LEFT JOIN taggings tg ON tg.target_id = s.spot_id AND tg.target_type = 'spot'
        LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY s.spot_id
        ORDER BY ${orderBySql}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryValues
    );

    const spots = spotsResult.rows.map(s => ({
        ...s,
        x: Number(s.x),
        y: Number(s.y),
        recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        tags: s.tags || [],
        top_tags: s.tags || [],
    }));

    const total = Number(countResult.rows[0]?.total || 0);

    return {
        total,
        total_count: total,
        page: Number(page),
        limit: Number(limit),
        spots,
    };
};



// ──────────────────────────────────────────────────────────────────────
// 스팟 상세 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpotById = async (spotId) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(spotId).trim());
    if (!isUuid) {
        if (/^\d+$/.test(String(spotId).trim())) {
            const tourDetail = await tourApiService.getSpotDetail(spotId);
            return {
                spot_id: String(spotId),
                content_id: String(spotId),
                name: tourDetail.title,
                address: tourDetail.address,
                x: tourDetail.x,
                y: tourDetail.y,
                source: 'tour',
                overview: tourDetail.overview,
                tel: tourDetail.tel,
                homepage: tourDetail.homepage,
                first_image: tourDetail.images?.[0]?.image_url || null,
                images: tourDetail.images?.map(i => i.image_url) || [],
                top_tags: [],
                courses: [],
            };
        }
        const err = new Error('스팟을 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    const spotResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.kakao_category_name,
            s.region, s.sub_region,
                        s.recommend_pct, s.source, s.content_place, s.content_history, s.content_tour,
            s.barrier_free_info, s.pet_tour_info, s.is_night_tour,
            s.first_image,
            ST_X(s.location::GEOMETRY) AS x,
            ST_Y(s.location::GEOMETRY) AS y,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
            ) AS top_tags
         FROM spots s
         LEFT JOIN taggings tg ON tg.target_type = 'spot' AND tg.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
         WHERE s.spot_id = $1 AND s.status = 'active'
         GROUP BY s.spot_id`,
        [spotId]
    );

    if (!spotResult.rows.length) {
        const err = new Error('스팟을 찾을 수 없습니다.');
        err.status = 404; throw err;
    }

    const coursesResult = await pool.query(
        `SELECT DISTINCT c.course_id, c.name, c.total_distance, c.estimated_duration, c.is_public
         FROM courses c
         JOIN course_waypoints cw ON cw.course_id = c.course_id
         WHERE cw.spot_id = $1 AND c.status = 'active' AND c.is_public = TRUE
         LIMIT 10`,
        [spotId]
    );

    const spot = spotResult.rows[0];
    return {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        courses: coursesResult.rows,
    };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 직접 등록
// ──────────────────────────────────────────────────────────────────────
exports.createSpot = async (body) => {
    const { name, x, y, address, categories, kakao_category_name, content_place, content_history, content_tour, region, sub_region } = body;
    const normalizedCategories = normalizeSpotCategoriesInput(categories);

    if (normalizedCategories.length === 0) {
        const err = new Error('categories는 비어있지 않은 문자열 배열이어야 합니다.');
        err.status = 400; throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x, y는 유효한 숫자여야 합니다.');
        err.status = 400; throw err;
    }

                    // 좌표(스팟 자체 위치) 기반 권역 추론 → 춘천이면 근처 권역, 아니면 주소 키워드 폴백
    // (이용자 실시간 GPS 아님 → LBS 사업자 미신고 요건 유지)
    const regionInfo = inferRegionFromLocation({
        lat,
        lng,
        address: `${address || ''} ${name || ''}`,
    });
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

    // 같은 이름의 장소가 300m 안에 이미 있으면 새로 만들지 않는다 (utils/spotIdentity.js)
    const duplicate = await findExistingSpot(pool, { name, lat, lng });
    if (duplicate) {
        const err = new Error(`이미 등록된 장소입니다: ${duplicate.name}`);
        err.status = 409;
        err.spot_id = duplicate.spot_id;
        throw err;
    }

    const result = await pool.query(
        `INSERT INTO spots (
            name, location, address, categories,
            kakao_category_name, source,
            content_place, content_history, content_tour,
            region, sub_region
        ) VALUES (
            $1, ST_Point($2, $3)::GEOGRAPHY, $4, $5::TEXT[], $6, 'admin', $7, $8, $9, $10, $11
        )
        RETURNING
            spot_id, name, address, categories, kakao_category_name, source,
            region, sub_region,
            content_place, content_history, content_tour,
            recommend_pct, status, created_at,
            ST_X(location::GEOMETRY) AS x,
            ST_Y(location::GEOMETRY) AS y`,
        [name, lng, lat, address || null, normalizedCategories, kakao_category_name || null,
         content_place || null, content_history || null, content_tour || null,
         determinedRegion, determinedSubRegion]
    );

    const spot = result.rows[0];
    return { ...spot, x: Number(spot.x), y: Number(spot.y) };
};

// ──────────────────────────────────────────────────────────────────────
// 카카오 스팟 저장
// ──────────────────────────────────────────────────────────────────────
exports.saveKakaoSpot = async (rawBody, userId) => {
    const body = await normalizeLegacyPlaceId(rawBody);
    const {
        kakao_place_id,
        name,
        kakao_category_name,
        categories,
        address,
        road_address_name,
        address_name,
        x,
        y,
        region,
        sub_region,
        tour_api_content_id,
    } = body;
    const normalizedCategories = normalizeSpotCategoriesInput(categories);

    if (normalizedCategories.length === 0) {
        const err = new Error('categories must be a non-empty string array');
        err.status = 400; throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    const selectedAddress = road_address_name || address || address_name || null;

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x and y must be valid numbers');
        err.status = 400; throw err;
    }

                    // 좌표(스팟 자체 위치) 기반 권역 추론 → 춘천이면 근처 권역, 아니면 주소 키워드 폴백
    // (이용자 실시간 GPS 아님 → LBS 사업자 미신고 요건 유지)
    const regionInfo = inferRegionFromLocation({
        lat,
        lng,
        address: `${selectedAddress || ''} ${name || ''}`,
    });
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

    // 이미 있는 장소인지 TourAPI 번호 → 카카오 번호 → 같은 이름 + 300m 순서로 확인 (utils/spotIdentity.js)
    const kakaoPlaceId = toKakaoPlaceId(kakao_place_id);
    const matchedSpot = await findExistingSpot(pool, {
        tourContentId: tour_api_content_id, kakaoPlaceId, name, lat, lng,
    });
    if (matchedSpot) {
        await linkExternalIds(pool, matchedSpot.spot_id, { tourContentId: tour_api_content_id, kakaoPlaceId });
    }

    const createdResult = matchedSpot ? { rows: [] } : await pool.query(
        `INSERT INTO spots (kakao_place_id, tour_content_id, name, location, address, categories, kakao_category_name, source, region, sub_region, last_synced_at)
         VALUES ($1, $10, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[], $7, 'kakao', $8, $9, NOW())
         ON CONFLICT DO NOTHING
         RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                   region, sub_region,
                   recommend_pct, content_tour,
                   ST_X(location::GEOMETRY) AS x,
                   ST_Y(location::GEOMETRY) AS y`,
        [kakaoPlaceId, name, lng, lat, selectedAddress, normalizedCategories, kakao_category_name || null, determinedRegion, determinedSubRegion,
         toTourContentId(tour_api_content_id)]
    );

    if (createdResult.rows.length > 0) {
        const spot = createdResult.rows[0];
        const normalizedSpot = {
            ...spot,
            x: Number(spot.x),
            y: Number(spot.y),
            recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
            tour_api_content_id,
        };
        const enriched = await enrichKakaoSpotTourContent(normalizedSpot, userId);
        return { is_created: true, ...enriched };
    }

    const existingResult = await pool.query(
        `SELECT spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                region, sub_region,
                recommend_pct, content_tour, status, first_image,
                tour_content_id,
                tour_enriched_at > NOW() - ($2::int * INTERVAL '1 day') AS is_recently_enriched,
                ST_X(location::GEOMETRY) AS x,
                ST_Y(location::GEOMETRY) AS y
         FROM spots WHERE ${matchedSpot ? 'spot_id = $1' : 'kakao_place_id = $1'}`,
        [matchedSpot ? matchedSpot.spot_id : kakaoPlaceId, TOUR_ENRICH_REFRESH_DAYS]
    );

    const existingSpot = existingResult.rows[0];
    if (!existingSpot || existingSpot.status !== 'active') {
        const err = new Error('This spot is not available');
        err.status = 409; throw err;
    }

    let currentSpot = existingSpot;
    if (selectedAddress && existingSpot.address !== selectedAddress) {
        const updatedResult = await pool.query(
            `UPDATE spots SET address = $2, region = $3, sub_region = $4, last_synced_at = NOW() WHERE spot_id = $1
             RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                       region, sub_region,
                       recommend_pct, content_tour,
                       ST_X(location::GEOMETRY) AS x,
                       ST_Y(location::GEOMETRY) AS y`,
            [existingSpot.spot_id, selectedAddress, determinedRegion, determinedSubRegion]
        );
        currentSpot = updatedResult.rows[0];
    }

    const { status, is_recently_enriched: isRecentlyEnriched, ...spot } = { ...existingSpot, ...currentSpot };
    const normalizedSpot = {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        tour_api_content_id,
    };

    // 최근에 보강을 마친 스팟은 TourAPI·Odii 호출 없이 그대로 돌려준다.
    if (isRecentlyEnriched) {
        return {
            is_created: false,
            spot: normalizedSpot,
            tour_content_enriched: false,
            tour_content_status: 'skipped_recently_enriched',
            tour_content_match: null,
            barrier_free_enriched: false,
            pet_tour_enriched: false,
            attached_tags: [],
        };
    }

    const enriched = await enrichKakaoSpotTourContent(normalizedSpot, userId);
    return { is_created: false, ...enriched };
};

exports.searchKakaoSpotCandidates = searchKakaoSpotCandidates;
// 백필(재태깅) 스크립트에서 재사용할 수 있도록 노출
exports.extractTourTags = extractTourTags;
exports.attachTagsToSpot = attachTagsToSpot;
exports.ensureSystemTaggerId = ensureSystemTaggerId;
exports.enrichKakaoSpotTourContent = enrichKakaoSpotTourContent;

// ──────────────────────────────────────────────────────────────────────
// 스팟 검색 (카카오 + DB 통합)
// ──────────────────────────────────────────────────────────────────────
exports.searchSpots = async (query) => {
    const { category, tag_ids, min_recommend_pct, region } = query;
    const rawKeyword = Array.isArray(query.keyword ?? query.q) ? (query.keyword ?? query.q)[0] : (query.keyword ?? query.q);
    const keyword = rawKeyword === undefined || rawKeyword === null ? null : String(rawKeyword).trim();

    if (!category && !keyword) {
        const err = new Error('category or keyword query parameter is required');
        err.status = 400;
        throw err;
    }

    if (category && !SPOT_CATEGORIES.includes(category)) {
        const err = new Error('unsupported spot category');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    let tagIdList = [];
    if (tag_ids !== undefined && tag_ids !== null && tag_ids !== '') {
        const rawTagIds = Array.isArray(tag_ids) ? tag_ids.join(',') : tag_ids;
        tagIdList = rawTagIds.split(',').map(t => t.trim()).filter(Boolean);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (tagIdList.some(t => !uuidPattern.test(t))) {
            const err = new Error('tag_ids must be comma-separated UUID values');
            err.status = 400; throw err;
        }
    }

    let minRecommendPct = null;
    if (min_recommend_pct !== undefined && min_recommend_pct !== null && min_recommend_pct !== '') {
        minRecommendPct = Number(min_recommend_pct);
        if (!Number.isFinite(minRecommendPct) || minRecommendPct < 0 || minRecommendPct > 100) {
            const err = new Error('min_recommend_pct must be a number between 0 and 100');
            err.status = 400; throw err;
        }
    }

    const kakaoSpots = await searchKakaoSpotCandidates({
        keyword,
        category,
    });
    const kakaoPlaceIds = kakaoSpots.map(s => s.kakao_place_id);

    let savedKakaoPlaceIdSet = new Set();
    if (kakaoPlaceIds.length > 0) {
        const saved = await pool.query(
            `SELECT kakao_place_id FROM spots WHERE kakao_place_id = ANY($1::TEXT[])`,
            [kakaoPlaceIds]
        );
        savedKakaoPlaceIdSet = new Set(saved.rows.map(r => r.kakao_place_id));
    }

        // 저장 장소(saved_spots) 중 단순 un-enriched 카카오 임시 핀(투어/무장애 정보 및 태그 없는 경우)만 필터 미지정 시 제외
    // 단, 공식 코스 경유지로 연결된 스팟은 정보가 비어 있어도 노출한다.
    const whereConditions = ["s.status = 'active'"];
    if (!tagIdList.length && !category && !keyword) {
        whereConditions.push(`(
            s.source <> 'kakao'
            OR s.content_tour IS NOT NULL
            OR s.barrier_free_info IS NOT NULL
            OR EXISTS (SELECT 1 FROM taggings tg WHERE tg.target_id = s.spot_id)
            OR EXISTS (SELECT 1 FROM course_waypoints cw WHERE cw.spot_id = s.spot_id)
        )`);
    }
    const queryValues = [];
    let orderBySql = 's.created_at DESC';

    if (region && String(region).trim()) {
        const reg = String(region).trim();
        const normalizedReg = reg.toLowerCase();
        if (!['전국', '전체', 'all'].includes(normalizedReg)) {
            if (['seoul', '서울', '서울특별시'].includes(normalizedReg) || reg === '서울' || reg === '서울특별시') {
                queryValues.push('서울');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else if (
                ['chuncheon', '춘천', '춘천시', '강원', '강원도', '강원특별자치도', 'gangwon'].includes(normalizedReg) ||
                ['춘천', '춘천시', '강원', '강원도', '강원특별자치도'].includes(reg)
            ) {
                queryValues.push('춘천');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else {
                queryValues.push(`%${reg}%`);
                whereConditions.push(`(s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length} OR s.sub_region ILIKE $${queryValues.length})`);
            }
        }
    }

    if (category) {
        queryValues.push(category);
        whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
    }

    if (keyword) {
        queryValues.push(`%${keyword}%`);
        whereConditions.push(`(
            s.name ILIKE $${queryValues.length}
            OR COALESCE(s.address, '') ILIKE $${queryValues.length}
            OR COALESCE(s.kakao_category_name, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_place, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_history, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_tour, '') ILIKE $${queryValues.length}
        )`);
    }

    // 태그 ID 검색 — 그룹 확장 없이 AND(교집합) 매칭
    if (tagIdList.length > 0) {
        queryValues.push(tagIdList); const tagIdx = queryValues.length;
        queryValues.push(tagIdList.length); const countIdx = queryValues.length;
        whereConditions.push(`
            s.spot_id IN (
                SELECT tg.target_id FROM taggings tg
                JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
                WHERE tg.target_type = 'spot' AND tg.tag_id = ANY($${tagIdx}::UUID[])
                GROUP BY tg.target_id
                HAVING COUNT(DISTINCT tg.tag_id) = $${countIdx}
            )
        `);
    }

    // 태그 이름(tag_name / tag_names) 검색 지원 — 그룹 확장 없이 AND(교집합) 매칭
    const searchTargetTagNames = query.tag_name || query.tag_names;
    if (searchTargetTagNames) {
        const tagNameList = (Array.isArray(searchTargetTagNames) ? searchTargetTagNames.join(',') : searchTargetTagNames)
            .split(',')
            .map(t => t.trim().replace(/^#/, ''))
            .filter(Boolean);

        if (tagNameList.length > 0) {
            queryValues.push(tagNameList);
            const tagIdx = queryValues.length;
            queryValues.push(tagNameList.length);
            const countIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id
                    FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND t.name = ANY($${tagIdx}::TEXT[])
                    GROUP BY tg.target_id
                    HAVING COUNT(DISTINCT t.name) >= $${countIdx}
                )
            `);
        }
    }

    if (minRecommendPct !== null) {
        queryValues.push(minRecommendPct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

        const savedSpotsResult = await pool.query(
        `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories, s.kakao_category_name,
                s.region, s.sub_region,
                s.recommend_pct,
                s.first_image,
                -- 후기 사진 폴백: 사진이 있는 가장 최근 후기의 첫 사진 key
                (
                    SELECT sr.photos[1]
                    FROM spot_reviews sr
                    WHERE sr.spot_id = s.spot_id
                      AND sr.status = 'active'
                      AND sr.photos IS NOT NULL
                      AND array_length(sr.photos, 1) > 0
                    ORDER BY sr.created_at DESC
                    LIMIT 1
                ) AS review_photo_url,
                ST_X(s.location::GEOMETRY) AS x, ST_Y(s.location::GEOMETRY) AS y,
                COALESCE(json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]') AS tags
         FROM spots s
         LEFT JOIN taggings tg_all ON tg_all.target_type = 'spot' AND tg_all.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg_all.tag_id AND t.type = 'spot' AND t.is_active = true
         WHERE ${whereConditions.join(' AND ')}
         GROUP BY s.spot_id ORDER BY ${orderBySql} LIMIT 50`,
        queryValues
    );

    const savedSpots = savedSpotsResult.rows.map(s => ({
        ...s, x: Number(s.x), y: Number(s.y),
        recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        tags: s.tags || [],
        top_tags: s.tags || [],
        is_saved: true, has_app_data: true, filter_match: 'matched', result_group: 'saved_spot',
    }));

    const kakaoCandidates = kakaoSpots
        .filter(s => !savedKakaoPlaceIdSet.has(s.kakao_place_id))
        .map(s => ({
            ...s, is_saved: false, has_app_data: false, tags: [], recommend_pct: null,
            filter_match: tagIdList.length > 0 || minRecommendPct !== null ? 'unknown' : 'category_only',
            result_group: 'kakao_candidate',
        }));

    return {
        category,
        filters: { keyword, category: category || null, region: region || null, tag_ids: tagIdList, min_recommend_pct: minRecommendPct },
        raw_count: kakaoSpots.length,
        saved_count: savedSpots.length,
        kakao_candidate_count: kakaoCandidates.length,
        total_count: savedSpots.length + kakaoCandidates.length,
        saved_spots: savedSpots,
        kakao_candidates: kakaoCandidates,
        spots: [...savedSpots, ...kakaoCandidates],
    };
};

