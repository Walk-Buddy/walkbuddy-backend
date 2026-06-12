const pool = require('../config/db');
const axios = require('axios');
const { SPOT_CATEGORIES, SPOT_CATEGORY_SEARCH_RULES, inferSpotCategories } = require('../constants/spotCategoryRules');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const TOUR_API_MATCH_RADIUS = Number(process.env.TOUR_API_MATCH_RADIUS || 300);
const TOUR_API_FALLBACK_MATCH_RADIUS = 500;

function getTourApiServiceKey() {
    return process.env.TOUR_API_SERVICE_KEY || process.env.TOURAPI_SERVICE_KEY;
}

function getKakaoAddress(document) {
    return document.road_address_name || document.address_name || null;
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

    const response = await axios.get(`${TOUR_API_BASE_URL}/locationBasedList2`, {
        params: {
            serviceKey,
            MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
            MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
            _type: 'json',
            arrange: 'E',
            mapX: lng,
            mapY: lat,
            radius,
            numOfRows: 20,
            pageNo: 1,
        },
    });

    const item = response.data?.response?.body?.items?.item;
    return normalizeTourApiItems(item);
}

async function fetchTourOverview(contentId) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey || !contentId) return null;

    const response = await axios.get(`${TOUR_API_BASE_URL}/detailCommon2`, {
        params: {
            serviceKey,
            MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
            MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
            _type: 'json',
            contentId,
        },
    });

    const item = response.data?.response?.body?.items?.item;
    const detail = normalizeTourApiItems(item)[0];
    return cleanTourOverview(detail?.overview || '');
}

async function enrichKakaoSpotTourContent(spot) {
    const result = {
        tour_content_enriched: false,
        tour_content_status: 'skipped',
        tour_content_match: null,
    };

    if (!getTourApiServiceKey()) {
        result.tour_content_status = 'skipped_missing_tour_api_key';
        return { spot, ...result };
    }

    if (spot.content_tour) {
        result.tour_content_status = 'skipped_existing_content_tour';
        return { spot, ...result };
    }

    const lng = Number(spot.x);
    const lat = Number(spot.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        result.tour_content_status = 'skipped_invalid_location';
        return { spot, ...result };
    }

    try {
        let candidates = await fetchTourLocationCandidates({
            lng,
            lat,
            radius: TOUR_API_MATCH_RADIUS,
        });

        let matched = candidates
            .filter(candidate => isSameTourPlace(spot.name, candidate.title))
            .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0))[0];

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

        const overview = await fetchTourOverview(matched.contentid);
        if (!overview) {
            result.tour_content_status = 'matched_without_overview';
            result.tour_content_match = {
                content_id: String(matched.contentid),
                title: matched.title,
                distance: matched.dist == null ? null : Number(matched.dist),
            };
            return { spot, ...result };
        }

        const updatedResult = await pool.query(
            `UPDATE spots
             SET content_tour = $2
             WHERE spot_id = $1 AND content_tour IS NULL
             RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                       recommend_pct, content_tour,
                       ST_X(location::GEOMETRY) AS x,
                       ST_Y(location::GEOMETRY) AS y`,
            [spot.spot_id, overview]
        );

        const updatedSpot = updatedResult.rows[0];
        if (!updatedSpot) {
            result.tour_content_status = 'skipped_existing_content_tour';
            return { spot, ...result };
        }

        result.tour_content_enriched = true;
        result.tour_content_status = 'enriched';
        result.tour_content_match = {
            content_id: String(matched.contentid),
            title: matched.title,
            distance: matched.dist == null ? null : Number(matched.dist),
        };

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
        console.error('[TourAPI enrich failed]', err.message);
        result.tour_content_status = 'tour_api_error';
        return { spot, ...result };
    }
}

// ──────────────────────────────────────────────────────────────────────
// 스팟 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpots = async (query) => {
    const { x, y, radius, category, tag_ids, min_recommend_pct, page = 1, limit = 20 } = query;
    const offset = (Number(page) - 1) * Number(limit);
    const whereConditions = ["s.status = 'active'"];
    const queryValues = [];
    let distanceSelectSql = 'NULL::DOUBLE PRECISION AS distance';
    let orderBySql = 's.created_at DESC';

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

    if (min_recommend_pct !== undefined && min_recommend_pct !== null && min_recommend_pct !== '') {
        const pct = Number(min_recommend_pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            const err = new Error('min_recommend_pct must be between 0 and 100');
            err.status = 400; throw err;
        }
        queryValues.push(pct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

    if (x !== undefined && x !== null && x !== '' && y !== undefined && y !== null && y !== '') {
        const lng = Number(x);
        const lat = Number(y);
        const searchRadius = (!radius) ? 3000 : Number(radius);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            const err = new Error('x and y must be valid numbers');
            err.status = 400; throw err;
        }
        queryValues.push(lng); const lngIdx = queryValues.length;
        queryValues.push(lat); const latIdx = queryValues.length;
        queryValues.push(searchRadius); const radIdx = queryValues.length;
        distanceSelectSql = `ST_Distance(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY) AS distance`;
        whereConditions.push(`ST_DWithin(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY, $${radIdx})`);
        orderBySql = 'distance ASC';
    }

    const countResult = await pool.query(
        `SELECT COUNT(DISTINCT s.spot_id) AS total FROM spots s WHERE ${whereConditions.join(' AND ')}`,
        queryValues
    );

    queryValues.push(Number(limit)); const limitIdx = queryValues.length;
    queryValues.push(offset);        const offsetIdx = queryValues.length;

    const spotsResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.kakao_category_name,
            s.recommend_pct, s.source,
            ST_X(s.location::GEOMETRY) AS x,
            ST_Y(s.location::GEOMETRY) AS y,
            ${distanceSelectSql},
            COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
            ) AS top_tags
         FROM spots s
         LEFT JOIN taggings tg ON tg.target_type = 'spot' AND tg.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
         WHERE ${whereConditions.join(' AND ')}
         GROUP BY s.spot_id
         ORDER BY ${orderBySql}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryValues
    );

    return {
        total: Number(countResult.rows[0].total),
        page: Number(page),
        spots: spotsResult.rows.map(s => ({
            ...s,
            x: Number(s.x),
            y: Number(s.y),
            distance: s.distance == null ? null : Number(s.distance),
            recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        })),
    };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 상세 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpotById = async (spotId) => {
    const spotResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.kakao_category_name,
            s.recommend_pct, s.source, s.content_place, s.content_history, s.content_tour,
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
    const { name, x, y, address, categories, kakao_category_name, content_place, content_history, content_tour } = body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        const err = new Error('categories는 비어있지 않은 배열이어야 합니다.');
        err.status = 400; throw err;
    }
    const hasInvalidCategory = categories.some(c => !SPOT_CATEGORIES.includes(c));
    if (hasInvalidCategory) {
        const err = new Error('categories에 허용되지 않은 값이 있습니다.');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x, y는 유효한 숫자여야 합니다.');
        err.status = 400; throw err;
    }

    const result = await pool.query(
        `INSERT INTO spots (
            name, location, address, categories,
            kakao_category_name, source,
            content_place, content_history, content_tour
        ) VALUES (
            $1, ST_Point($2, $3)::GEOGRAPHY, $4, $5::TEXT[], $6, 'admin', $7, $8, $9
        )
        RETURNING
            spot_id, name, address, categories, kakao_category_name, source,
            content_place, content_history, content_tour,
            recommend_pct, status, created_at,
            ST_X(location::GEOMETRY) AS x,
            ST_Y(location::GEOMETRY) AS y`,
        [name, lng, lat, address || null, categories, kakao_category_name || null,
         content_place || null, content_history || null, content_tour || null]
    );

    const spot = result.rows[0];
    return { ...spot, x: Number(spot.x), y: Number(spot.y) };
};

// ──────────────────────────────────────────────────────────────────────
// 카카오 스팟 저장
// ──────────────────────────────────────────────────────────────────────
exports.saveKakaoSpot = async (body) => {
    const { kakao_place_id, name, kakao_category_name, categories, address, road_address_name, address_name, x, y } = body;

    if (!Array.isArray(categories) || categories.length === 0) {
        const err = new Error('categories must be a non-empty array');
        err.status = 400; throw err;
    }
    const hasInvalidCategory = categories.some(c => !SPOT_CATEGORIES.includes(c));
    if (hasInvalidCategory) {
        const err = new Error('categories contain unsupported value');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    const selectedAddress = road_address_name || address || address_name || null;

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x and y must be valid numbers');
        err.status = 400; throw err;
    }

    const createdResult = await pool.query(
        `INSERT INTO spots (kakao_place_id, name, location, address, categories, kakao_category_name, source, last_synced_at)
         VALUES ($1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[], $7, 'kakao', NOW())
         ON CONFLICT (kakao_place_id) DO NOTHING
         RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                   recommend_pct, content_tour,
                   ST_X(location::GEOMETRY) AS x,
                   ST_Y(location::GEOMETRY) AS y`,
        [kakao_place_id, name, lng, lat, selectedAddress, categories, kakao_category_name || null]
    );

    if (createdResult.rows.length > 0) {
        const spot = createdResult.rows[0];
        const normalizedSpot = {
            ...spot,
            x: Number(spot.x),
            y: Number(spot.y),
            recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        };
        const enriched = await enrichKakaoSpotTourContent(normalizedSpot);
        return { is_created: true, ...enriched };
    }

    const existingResult = await pool.query(
        `SELECT spot_id, kakao_place_id, name, address, categories, kakao_category_name,
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
            `UPDATE spots SET address = $2, last_synced_at = NOW() WHERE spot_id = $1
             RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                       recommend_pct, content_tour,
                       ST_X(location::GEOMETRY) AS x,
                       ST_Y(location::GEOMETRY) AS y`,
            [existingSpot.spot_id, selectedAddress]
        );
        currentSpot = updatedResult.rows[0];
    }

    const { status, ...spot } = currentSpot;
    const normalizedSpot = {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
    };
    const enriched = await enrichKakaoSpotTourContent(normalizedSpot);
    return { is_created: false, ...enriched };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 검색 (카카오 + DB 통합)
// ──────────────────────────────────────────────────────────────────────
exports.searchSpots = async (query) => {
    const { category, tag_ids, x, y, radius, min_recommend_pct } = query;
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

    const hasX = x !== undefined && x !== null && x !== '';
    const hasY = y !== undefined && y !== null && y !== '';
    if (hasX !== hasY) {
        const err = new Error('x and y must be provided together');
        err.status = 400;
        throw err;
    }

    const hasLocation = hasX && hasY;
    let lng = null, lat = null, searchRadius = null;

    if (hasLocation) {
        lng = Number(x); lat = Number(y);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            const err = new Error('x and y must be valid numbers');
            err.status = 400; throw err;
        }
    }

    if (radius !== undefined && radius !== null && radius !== '') {
        searchRadius = Number(radius);
        if (!Number.isFinite(searchRadius) || searchRadius <= 0) {
            const err = new Error('radius must be a valid number greater than 0');
            err.status = 400; throw err;
        }
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

    const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;
    if (!kakaoRestApiKey) {
        const err = new Error('Kakao REST API key is not configured');
        err.status = 500; throw err;
    }

    const rules = keyword ? [{ query: keyword }] : SPOT_CATEGORY_SEARCH_RULES[category];
    const allDocuments = [];

    for (const rule of rules) {
        const params = { query: rule.query, size: 15, page: 1 };
        if (rule.category_group_code) params.category_group_code = rule.category_group_code;
        if (hasLocation) {
            params.x = lng;
            params.y = lat;
            params.sort = 'distance';
            if (searchRadius !== null) params.radius = searchRadius;
        }

        const kakaoResponse = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
            params,
            headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
        });
        allDocuments.push(...kakaoResponse.data.documents);
    }

    const uniqueKakaoSpotMap = new Map();
    for (const document of allDocuments) {
        const categories = inferSpotCategories(document);
        if (categories.length === 0) continue;
        if (category && !categories.includes(category)) continue;
        uniqueKakaoSpotMap.set(document.id, {
            kakao_place_id: document.id,
            name: document.place_name,
            kakao_category_name: document.category_name,
            categories,
            address: getKakaoAddress(document),
            x: document.x, y: document.y,
            distance: document.distance ? Number(document.distance) : null,
        });
    }

    const kakaoSpots = Array.from(uniqueKakaoSpotMap.values());
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
    let distanceSelectSql = 'NULL::DOUBLE PRECISION AS distance';
    let orderBySql = 's.created_at DESC';

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

    if (hasLocation) {
        queryValues.push(lng); const lngIdx = queryValues.length;
        queryValues.push(lat); const latIdx = queryValues.length;
        distanceSelectSql = `ST_Distance(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY) AS distance`;
        orderBySql = 'distance ASC';
        if (searchRadius !== null) {
            queryValues.push(searchRadius); const radIdx = queryValues.length;
            whereConditions.push(`ST_DWithin(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY, $${radIdx})`);
        }
    }

    const savedSpotsResult = await pool.query(
        `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories, s.kakao_category_name,
                s.recommend_pct,
                ST_X(s.location::GEOMETRY) AS x, ST_Y(s.location::GEOMETRY) AS y,
                ${distanceSelectSql},
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
        distance: s.distance == null ? null : Number(s.distance),
        recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        is_saved: true, has_app_data: true, filter_match: 'matched', result_group: 'saved_spot',
    }));

    const kakaoCandidates = kakaoSpots
        .filter(s => !savedKakaoPlaceIdSet.has(s.kakao_place_id))
        .map(s => ({
            ...s, is_saved: false, has_app_data: false, tags: [], recommend_pct: null,
            filter_match: tagIdList.length > 0 || minRecommendPct !== null ? 'unknown' : 'category_location_only',
            result_group: 'kakao_candidate',
        }));

    return {
        category,
        filters: { keyword, category: category || null, tag_ids: tagIdList, x: hasLocation ? lng : null, y: hasLocation ? lat : null, radius: searchRadius, min_recommend_pct: minRecommendPct },
        raw_count: allDocuments.length,
        saved_count: savedSpots.length,
        kakao_candidate_count: kakaoCandidates.length,
        total_count: savedSpots.length + kakaoCandidates.length,
        saved_spots: savedSpots,
        kakao_candidates: kakaoCandidates,
        spots: [...savedSpots, ...kakaoCandidates],
    };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 필터 조회
// ──────────────────────────────────────────────────────────────────────
exports.filterSpots = async (query) => {
    const { category, tag_ids, x, y, radius, min_recommend_pct } = query;
    const whereConditions = ["s.status = 'active'"];
    const queryValues = [];
    let distanceSelectSql = 'NULL::DOUBLE PRECISION AS distance';
    let orderBySql = 's.created_at DESC';

    if (category) {
        if (!SPOT_CATEGORIES.includes(category)) {
            const err = new Error('unsupported spot category');
            err.status = 400; err.supported_categories = SPOT_CATEGORIES; throw err;
        }
        queryValues.push(category);
        whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
    }

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

    if (min_recommend_pct) {
        const pct = Number(min_recommend_pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            const err = new Error('min_recommend_pct must be a number between 0 and 100');
            err.status = 400; throw err;
        }
        queryValues.push(pct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

    if (x !== undefined && x !== '' && y !== undefined && y !== '') {
        const lng = Number(x); const lat = Number(y);
        const searchRadius = radius ? Number(radius) : 3000;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            const err = new Error('x and y must be valid numbers');
            err.status = 400; throw err;
        }
        queryValues.push(lng); const lngIdx = queryValues.length;
        queryValues.push(lat); const latIdx = queryValues.length;
        queryValues.push(searchRadius); const radIdx = queryValues.length;
        distanceSelectSql = `ST_Distance(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY) AS distance`;
        whereConditions.push(`ST_DWithin(s.location, ST_Point($${lngIdx}, $${latIdx})::GEOGRAPHY, $${radIdx})`);
        orderBySql = 'distance ASC';
    }

    const result = await pool.query(
        `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories, s.kakao_category_name,
                s.recommend_pct, ST_X(s.location::GEOMETRY) AS x, ST_Y(s.location::GEOMETRY) AS y,
                ${distanceSelectSql},
                COALESCE(json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]') AS tags
         FROM spots s
         LEFT JOIN taggings tg_all ON tg_all.target_type = 'spot' AND tg_all.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg_all.tag_id AND t.type = 'spot' AND t.is_active = true
         WHERE ${whereConditions.join(' AND ')}
         GROUP BY s.spot_id ORDER BY ${orderBySql} LIMIT 50`,
        queryValues
    );

    return {
        total_count: result.rows.length,
        spots: result.rows.map(s => ({
            ...s, x: Number(s.x), y: Number(s.y),
            distance: s.distance == null ? null : Number(s.distance),
            recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        })),
    };
};
