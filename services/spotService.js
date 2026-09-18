const pool = require('../config/db');
const axios = require('axios');
const {
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    inferSpotCategoriesWithFallback,
    extractRegionFromAddress,
    resolveRegion,
} = require('../constants/spotCategoryRules');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const tourApiService = require('./tourApiService');
const trafficLog = require('./tourTrafficLog');

const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const TOUR_API_MATCH_RADIUS = Number(process.env.TOUR_API_MATCH_RADIUS || 300);
const TOUR_API_FALLBACK_MATCH_RADIUS = 500;

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

function isSameTourPlace(kakaoName, tourTitle) {
    const kakao = normalizePlaceName(kakaoName);
    const tour = normalizePlaceName(tourTitle);
    if (!kakao || !tour) return false;
    return kakao === tour || kakao.includes(tour) || tour.includes(kakao);
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
        throw err;
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

        return cleanTourOverview(detail?.overview || '');
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
function extractTourTags({ overview, barrierFreeInfo, petTourInfo }) {
    const tags = new Set();

    // 1. 일반 관광 개요 → 음성해설 태그
    if (overview) {
        tags.add('음성해설');
    }

    // 2. 무장애 편의시설 (KorWithService2) 세부 태그
    if (barrierFreeInfo?.has_barrier_free_info && barrierFreeInfo.details) {
        tags.add('열린관광');
        const d = barrierFreeInfo.details;
        if (d.physical?.wheelchair) tags.add('휠체어접근');
        if (d.physical?.route) tags.add('무단차통로');
        if (d.physical?.restroom) tags.add('장애인화장실');
        if (d.physical?.parking) tags.add('장애인주차');
        if (d.physical?.elevator) tags.add('엘리베이터');
        if (d.infant?.stroller) tags.add('유모차대여');
        if (d.infant?.lactation_room) tags.add('수유실');
        if (d.visual?.braile_block || d.visual?.braile_promotion) tags.add('점자안내');
        if (d.visual?.help_dog) tags.add('도우미견가능');
        if (d.visual?.audio_guide) tags.add('음성해설');
        if (d.hearing?.sign_language || d.hearing?.video_guide) tags.add('수어안내');
    }

    // 3. 반려동물 동반 (KorPetTourService2) 세부 태그
    if (petTourInfo?.has_pet_info) {
        tags.add('반려견동반');
        const petDetails = petTourInfo.details || {};
        const sizeStr = String(petDetails.allowed_pet_size || '');
        if (sizeStr.includes('대형견') || sizeStr.includes('모두') || sizeStr.includes('제한없음')) {
            tags.add('대형견가능');
        } else if (sizeStr.includes('소형견') || sizeStr.includes('중형견')) {
            tags.add('소형견동반');
        }

        const facilityStr = String(petDetails.facilities || '');
        if (facilityStr.includes('배변') || facilityStr.includes('봉투') || facilityStr.includes('수거함')) {
            tags.add('반려견배변시설');
        }
        if (facilityStr.includes('놀이터') || facilityStr.includes('운동장') || facilityStr.includes('펜스')) {
            tags.add('반려견놀이터');
        }
        if (facilityStr.includes('주차')) tags.add('주차가능');
        if (facilityStr.includes('화장실')) tags.add('화장실');
        if (facilityStr.includes('쉼터') || facilityStr.includes('벤치')) tags.add('벤치·쉼터');
    }

    return Array.from(tags);
}

// 스팟에 세부 태그 일괄 자동 부착
async function attachTagsToSpot(spotId, tagNames, userId) {
    if (!spotId || !Array.isArray(tagNames) || tagNames.length === 0) return;
    const cleanNames = tagNames.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
    if (cleanNames.length === 0) return;

    try {
        // 1. 기존 태그 확인
        const { rows: existingTags } = await pool.query(
            `SELECT tag_id, name FROM tags WHERE name = ANY($1::TEXT[]) AND type = 'spot'`,
            [cleanNames]
        );

        const existingNames = new Set(existingTags.map(r => r.name));
        const tagsToAttach = [...existingTags];

        // 2. 누락된 태그는 tags 테이블에 안전하게 자동 등록
        const missingNames = cleanNames.filter(n => !existingNames.has(n));
        for (const name of missingNames) {
            const { rows } = await pool.query(
                `INSERT INTO tags (name, type, group_name, is_active)
                 VALUES ($1, 'spot', '기타', TRUE)
                 ON CONFLICT (name, type) DO UPDATE SET is_active = TRUE
                 RETURNING tag_id, name`,
                [name]
            );
            if (rows[0]) tagsToAttach.push(rows[0]);
        }

        // 3. taggings 테이블에 일괄 등록
        for (const tag of tagsToAttach) {
            await pool.query(
                `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
                 VALUES ($1, $2, 'spot', $3)
                 ON CONFLICT DO NOTHING`,
                [tag.tag_id, spotId, userId || null]
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
        const categories = inferSpotCategoriesWithFallback(document);
        if (categories.length === 0) continue;
        if (category && !categories.includes(category)) continue;
        uniqueKakaoSpotMap.set(document.id, {
            kakao_place_id: document.id,
            name: document.place_name,
            kakao_category_name: document.category_name,
            categories,
            address: getKakaoAddress(document),
            x: document.x,
            y: document.y,
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

    try {
        let matched = await findTourApiMatchByContentId(spot.tour_api_content_id);
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

        if (!matched?.contentid) {
            result.tour_content_status = 'no_matching_tour_place';
            return { spot, ...result };
        }

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

        const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
        const barrierFreeInfo = barrierFreeResult.status === 'fulfilled' ? barrierFreeResult.value : null;
        const petTourInfo = petTourResult.status === 'fulfilled' ? petTourResult.value : null;

        // 2. DB 업데이트 구성 (content_tour, barrier_free_info)
        const updateClauses = [];
        const updateParams = [spot.spot_id];

        if (overview && !spot.content_tour) {
            updateParams.push(overview);
            updateClauses.push(`content_tour = $${updateParams.length}`);
            result.tour_content_enriched = true;
        }

        if (barrierFreeInfo?.has_barrier_free_info) {
            updateParams.push(JSON.stringify(barrierFreeInfo.details));
            updateClauses.push(`barrier_free_info = $${updateParams.length}`);
            result.barrier_free_enriched = true;
        }

        if (petTourInfo?.has_pet_info) {
            result.pet_tour_enriched = true;
        }

        let updatedSpot = spot;
        if (updateClauses.length > 0) {
            const updatedResult = await pool.query(
                `UPDATE spots
                 SET ${updateClauses.join(', ')}
                 WHERE spot_id = $1
                 RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                           recommend_pct, content_tour, barrier_free_info,
                           ST_X(location::GEOMETRY) AS x,
                           ST_Y(location::GEOMETRY) AS y`,
                updateParams
            );
            if (updatedResult.rows[0]) {
                updatedSpot = updatedResult.rows[0];
            }
        }

        // 3. 세부 기능별 태그 자동 도출 및 일괄 부착
        const autoTags = extractTourTags({ overview, barrierFreeInfo, petTourInfo });
        if (autoTags.length > 0) {
            await attachTagsToSpot(updatedSpot.spot_id, autoTags, userId);
            result.attached_tags = autoTags;
        }

        result.tour_content_status = (result.tour_content_enriched || result.barrier_free_enriched || result.pet_tour_enriched)
            ? 'enriched'
            : 'matched_without_new_content';

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
    const whereConditions = ["s.status = 'active'"];
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

    // 태그 ID 목록 검색 (UUID)
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
            queryValues.push(tagIdList.length); const cntIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id FROM taggings tg
                    WHERE tg.target_type = 'spot' AND tg.tag_id = ANY($${tagIdx}::UUID[])
                    GROUP BY tg.target_id HAVING COUNT(DISTINCT tg.tag_id) = $${cntIdx}
                )
            `);
        }
    }

    // 태그 이름(tag_name / tag_names) 검색 지원
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
            const cntIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id
                    FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND t.name = ANY($${tagIdx}::TEXT[])
                    GROUP BY tg.target_id
                    HAVING COUNT(DISTINCT t.name) >= $${cntIdx}
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
            s.barrier_free_info, s.is_night_tour,
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
    const spotResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.kakao_category_name,
            s.region, s.sub_region,
            s.recommend_pct, s.source, s.content_place, s.content_history, s.content_tour,
            s.barrier_free_info, s.is_night_tour,
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

    const regionInfo = extractRegionFromAddress(`${address || ''} ${name || ''}`);
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

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
exports.saveKakaoSpot = async (body, userId) => {
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

    const regionInfo = extractRegionFromAddress(`${selectedAddress || ''} ${name || ''}`);
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

    const createdResult = await pool.query(
        `INSERT INTO spots (kakao_place_id, name, location, address, categories, kakao_category_name, source, region, sub_region, last_synced_at)
         VALUES ($1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[], $7, 'kakao', $8, $9, NOW())
         ON CONFLICT (kakao_place_id) DO NOTHING
         RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                   region, sub_region,
                   recommend_pct, content_tour,
                   ST_X(location::GEOMETRY) AS x,
                   ST_Y(location::GEOMETRY) AS y`,
        [kakao_place_id, name, lng, lat, selectedAddress, normalizedCategories, kakao_category_name || null, determinedRegion, determinedSubRegion]
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
                recommend_pct, content_tour, status,
                ST_X(location::GEOMETRY) AS x,
                ST_Y(location::GEOMETRY) AS y
         FROM spots WHERE kakao_place_id = $1`,
        [kakao_place_id]
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

    const { status, ...spot } = currentSpot;
    const normalizedSpot = {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        tour_api_content_id,
    };
    const enriched = await enrichKakaoSpotTourContent(normalizedSpot, userId);
    return { is_created: false, ...enriched };
};

exports.searchKakaoSpotCandidates = searchKakaoSpotCandidates;

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

    const whereConditions = ["s.status = 'active'"];
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

    if (tagIdList.length > 0) {
        queryValues.push(tagIdList); const tagIdx = queryValues.length;
        queryValues.push(tagIdList.length); const cntIdx = queryValues.length;
        whereConditions.push(`
            s.spot_id IN (
                SELECT tg.target_id FROM taggings tg
                WHERE tg.target_type = 'spot' AND tg.tag_id = ANY($${tagIdx}::UUID[])
                GROUP BY tg.target_id HAVING COUNT(DISTINCT tg.tag_id) = $${cntIdx}
            )
        `);
    }

    if (minRecommendPct !== null) {
        queryValues.push(minRecommendPct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

    const savedSpotsResult = await pool.query(
        `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories, s.kakao_category_name,
                s.region, s.sub_region,
                s.recommend_pct,
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

