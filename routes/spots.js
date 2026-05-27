const express = require('express');
const axios = require('axios');
const pool = require('../config/db');

const {
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    inferSpotCategories,
} = require('../constants/spotCategoryRules');

const router = express.Router();

function isMissing(value) {
    return value === undefined || value === null || value === '';
}

function getKakaoAddress(document) {
    return document.road_address_name || document.address_name || null;
}

function getKakaoSearchRules(category) {
    if (!isMissing(category)) {
        return SPOT_CATEGORY_SEARCH_RULES[category];
    }

    const uniqueRuleMap = new Map();

    for (const rules of Object.values(SPOT_CATEGORY_SEARCH_RULES)) {
        for (const rule of rules) {
            const key = `${rule.query}:${rule.category_group_code || ''}`;
            uniqueRuleMap.set(key, rule);
        }
    }

    return Array.from(uniqueRuleMap.values());
}

router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'spot router connected',
    });
});

// 사용자의 스팟 검색 조건으로 DB의 정확한 결과와 카카오 추가 후보를 함께 조회합니다.
router.get('/search', async (req, res) => {
    const {
        category,
        tag_ids,
        x,
        y,
        radius,
        min_recommend_pct,
    } = req.query;

    const hasCategory = !isMissing(category);

    // 지원하지 않는 카테고리 값은 검색하지 않음
    if (hasCategory && !SPOT_CATEGORIES.includes(category)) {
        return res.status(400).json({
            success: false,
            message: 'unsupported spot category',
            supported_categories: SPOT_CATEGORIES,
        });
    }

    if (isMissing(x) || isMissing(y)) {
        return res.status(400).json({
            success: false,
            message: 'x and y query parameters are required',
        });
    }

    const lng = Number(x);
    const lat = Number(y);
    const searchRadius = isMissing(radius) ? 3000 : Number(radius);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return res.status(400).json({
            success: false,
            message: 'x and y must be valid numbers',
        });
    }

    if (!Number.isFinite(searchRadius) || searchRadius <= 0) {
        return res.status(400).json({
            success: false,
            message: 'radius must be a positive number',
        });
    }

    let tagIdList = [];

    if (!isMissing(tag_ids)) {
        const rawTagIds = Array.isArray(tag_ids) ? tag_ids.join(',') : tag_ids;
        tagIdList = rawTagIds
            .split(',')
            .map((tagId) => tagId.trim())
            .filter(Boolean);

        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const hasInvalidTagId = tagIdList.some((tagId) => !uuidPattern.test(tagId));

        if (hasInvalidTagId) {
            return res.status(400).json({
                success: false,
                message: 'tag_ids must be comma-separated UUID values',
            });
        }
    }

    let minRecommendPct = null;

    if (!isMissing(min_recommend_pct)) {
        minRecommendPct = Number(min_recommend_pct);

        if (!Number.isFinite(minRecommendPct) || minRecommendPct < 0 || minRecommendPct > 100) {
            return res.status(400).json({
                success: false,
                message: 'min_recommend_pct must be a number between 0 and 100',
            });
        }
    }

    const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;

    //카카오 api 키가 설정되지 않은 경우 에러 응답
    if (!kakaoRestApiKey) {
        return res.status(500).json({
            success: false,
            message: 'Kakao REST API key is not configured',
        });
    }

    // category가 있으면 해당 카테고리 규칙만 사용하고,
    // category가 없으면 전체 스팟 카테고리의 카카오 검색 규칙을 사용합니다.
    const rules = getKakaoSearchRules(category);

    // 여러 카카오 query에서 받은 documents를 하나로 합쳐 담을 배열
    const allDocuments = [];

    try {
        // 선택된 카테고리가 없으면 모든 스팟 카테고리의 검색 규칙을 실행합니다.
        for (const rule of rules) {
            const params = {
                query: rule.query,
                size: 15,
                page: 1,
            };

            //필요한 rule에만 카카오 카테고리 그룹 코드를 추가합니다.
            if (rule.category_group_code) {
                params.category_group_code = rule.category_group_code;
            }

            // 기준 위치는 필수이므로 카카오 API에도 같은 반경을 적용해 가까운 후보만 받습니다.
            params.x = lng;
            params.y = lat;
            params.sort = 'distance';
            params.radius = searchRadius;

            // 카카오 장소 검색 API 호출
            const kakaoResponse = await axios.get(
                'https://dapi.kakao.com/v2/local/search/keyword.json',
                {
                    params,
                    headers: {
                        //카카오 REST API는 Authorization 헤더에 KakaoAK 키 형식으로 인증합니다.
                        Authorization: `KakaoAK ${kakaoRestApiKey}`,
                    },
                }
            );

            allDocuments.push(...kakaoResponse.data.documents);
        }

        // 카카오 장소 id를 기준으로 중복 장소를 제거합니다.
        const uniqueKakaoSpotMap = new Map();

        for (const document of allDocuments) {
            const categories = inferSpotCategories(document);

            if (categories.length === 0) {
                continue;
            }

            const spot = {
                kakao_place_id: document.id,
                name: document.place_name,
                kakao_category_name: document.category_name,
                categories,
                address: getKakaoAddress(document),
                x: document.x,
                y: document.y,
                distance: document.distance ? Number(document.distance) : null,
            };

            uniqueKakaoSpotMap.set(document.id, spot);
        }

        const kakaoSpots = Array.from(uniqueKakaoSpotMap.values());
        const kakaoPlaceIds = kakaoSpots.map((spot) => spot.kakao_place_id);

        // 카카오 후보 중 이미 DB에 저장된 장소는 추가 후보에서 제외합니다.
        let savedKakaoPlaceIdSet = new Set();

        if (kakaoPlaceIds.length > 0) {
            const savedKakaoPlaceIdResult = await pool.query(
                `
                SELECT
                    kakao_place_id
                FROM spots
                WHERE kakao_place_id = ANY($1::TEXT[])
                `,
                [kakaoPlaceIds]
            );

            savedKakaoPlaceIdSet = new Set(
                savedKakaoPlaceIdResult.rows.map((row) => row.kakao_place_id)
            );
        }

        const whereConditions = ["s.status = 'active'"];
        const queryValues = [];
        let distanceSelectSql = 'NULL::DOUBLE PRECISION AS distance';
        let orderBySql = 's.created_at DESC';

        if (hasCategory) {
            queryValues.push(category);
            whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
        }

        if (tagIdList.length > 0) {
            queryValues.push(tagIdList);
            const tagIdsParamIndex = queryValues.length;

            queryValues.push(tagIdList.length);
            const tagCountParamIndex = queryValues.length;

            // 사용자가 선택한 태그를 모두 가진 저장 스팟만 정확한 결과로 반환합니다.
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id
                    FROM taggings tg
                    WHERE tg.target_type = 'spot'
                    AND tg.tag_id = ANY($${tagIdsParamIndex}::UUID[])
                    GROUP BY tg.target_id
                    HAVING COUNT(DISTINCT tg.tag_id) = $${tagCountParamIndex}
                )
            `);
        }

        if (minRecommendPct !== null) {
            queryValues.push(minRecommendPct);
            whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
        }

        queryValues.push(lng);
        const lngParamIndex = queryValues.length;

        queryValues.push(lat);
        const latParamIndex = queryValues.length;

        queryValues.push(searchRadius);
        const radiusParamIndex = queryValues.length;

        distanceSelectSql = `
            ST_Distance(
                s.location,
                ST_Point($${lngParamIndex}, $${latParamIndex})::GEOGRAPHY
            ) AS distance
        `;

        whereConditions.push(`
            ST_DWithin(
                s.location,
                ST_Point($${lngParamIndex}, $${latParamIndex})::GEOGRAPHY,
                $${radiusParamIndex}
            )
        `);

        orderBySql = 'distance ASC';

        const savedSpotsResult = await pool.query(
            `
            SELECT
                s.spot_id,
                s.kakao_place_id,
                s.name,
                s.address,
                s.categories,
                s.kakao_category_name,
                s.recommend_pct,
                ST_X(s.location::GEOMETRY) AS x,
                ST_Y(s.location::GEOMETRY) AS y,
                ${distanceSelectSql},
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'tag_id', t.tag_id,
                            'name', t.name
                        )
                    ) FILTER (WHERE t.tag_id IS NOT NULL),
                    '[]'
                ) AS tags
            FROM spots s
            LEFT JOIN taggings tg_all
                ON tg_all.target_type = 'spot'
                AND tg_all.target_id = s.spot_id
            LEFT JOIN tags t
                ON t.tag_id = tg_all.tag_id
                AND t.type = 'spot'
                AND t.is_active = true
            WHERE ${whereConditions.join(' AND ')}
            GROUP BY s.spot_id
            ORDER BY ${orderBySql}
            LIMIT 50
            `,
            queryValues
        );

        const savedSpots = savedSpotsResult.rows.map((spot) => ({
            ...spot,
            x: Number(spot.x),
            y: Number(spot.y),
            distance: spot.distance === null ? null : Number(spot.distance),
            recommend_pct: spot.recommend_pct === null
                ? null
                : Number(spot.recommend_pct),
            is_saved: true,
        }));

        const kakaoCandidates = kakaoSpots
            .filter((spot) => !savedKakaoPlaceIdSet.has(spot.kakao_place_id))
            .map((spot) => ({
                ...spot,
                is_saved: false,
                tags: [],
                recommend_pct: null,
            }));

        return res.json({
            success: true,
            category: hasCategory ? category : null,
            filters: {
                tag_ids: tagIdList,
                x: lng,
                y: lat,
                radius: searchRadius,
                min_recommend_pct: minRecommendPct,
            },
            raw_count: allDocuments.length,
            saved_count: savedSpots.length,
            kakao_candidate_count: kakaoCandidates.length,
            total_count: savedSpots.length + kakaoCandidates.length,
            saved_spots: savedSpots,
            kakao_candidates: kakaoCandidates,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);

        //클라이언트에 통일된 에러 응답 반환
        return res.status(500).json({
            success: false,
            message: 'Failed to search spots',
        });
    }
});

// 사용자가 카카오 검색 결과 목록에서 특정 장소를 선택했을 때 호출되는 API입니다.
// 이미 저장된 장소는 기존 데이터를 반환하고, 저장되지 않은 장소만 새로 저장합니다.
router.post('/kakao', async (req, res) => {
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
    } = req.body;

    try {
        if (!kakao_place_id || !name || isMissing(x) || isMissing(y)) {
            return res.status(400).json({
                success: false,
                message: 'kakao_place_id, name, x, y are required',
            });
        }

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'categories must be a non-empty array',
            });
        }

        // DB의 categories CHECK 제약에 걸리지 않도록 허용된 앱 카테고리만 저장합니다.
        const hasInvalidCategory = categories.some(
            (category) => !SPOT_CATEGORIES.includes(category)
        );

        if (hasInvalidCategory) {
            return res.status(400).json({
                success: false,
                message: 'categories contain unsupported value',
                supported_categories: SPOT_CATEGORIES,
            });
        }

        const lng = Number(x);
        const lat = Number(y);
        const selectedAddress = road_address_name || address || address_name || null;

        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return res.status(400).json({
                success: false,
                message: 'x and y must be valid numbers',
            });
        }

        // PostGIS POINT는 경도, 위도 순서로 저장합니다. 카카오 x는 경도, y는 위도입니다.
        const createdSpotResult = await pool.query(
            `
            INSERT INTO spots (
                kakao_place_id,
                name,
                location,
                address,
                categories,
                kakao_category_name,
                source,
                last_synced_at
            )
            VALUES (
                $1,
                $2,
                ST_Point($3, $4)::GEOGRAPHY,
                $5,
                $6::TEXT[],
                $7,
                'kakao',
                NOW()
            )
            ON CONFLICT (kakao_place_id) DO NOTHING
            RETURNING
                spot_id,
                kakao_place_id,
                name,
                address,
                categories,
                kakao_category_name,
                recommend_pct
            `,
            [
                kakao_place_id,
                name,
                lng,
                lat,
                selectedAddress,
                categories,
                kakao_category_name || null,
            ]
        );

        if (createdSpotResult.rows.length > 0) {
            const createdSpot = createdSpotResult.rows[0];

            return res.status(201).json({
                success: true,
                is_created: true,
                spot: {
                    ...createdSpot,
                    recommend_pct: createdSpot.recommend_pct === null
                        ? null
                        : Number(createdSpot.recommend_pct),
                },
            });
        }

        // 동시에 같은 kakao_place_id 저장 요청이 들어와도 unique 충돌을 500으로 보내지 않고 기존 행을 조회해 응답합니다.
        const existingSpotResult = await pool.query(
            `
            SELECT
                spot_id,
                kakao_place_id,
                name,
                address,
                categories,
                kakao_category_name,
                recommend_pct,
                status
            FROM spots
            WHERE kakao_place_id = $1
            `,
            [kakao_place_id]
        );

        const existingSpot = existingSpotResult.rows[0];

        if (!existingSpot || existingSpot.status !== 'active') {
            return res.status(409).json({
                success: false,
                message: 'This spot is not available',
            });
        }

        let currentSpot = existingSpot;

        // 기존 스팟이 지번 주소로 저장되어 있다면, 선택 시 전달된 도로명 주소로 보강합니다.
        if (selectedAddress && existingSpot.address !== selectedAddress) {
            const updatedSpotResult = await pool.query(
                `
                UPDATE spots
                SET
                    address = $2,
                    last_synced_at = NOW()
                WHERE spot_id = $1
                RETURNING
                    spot_id,
                    kakao_place_id,
                    name,
                    address,
                    categories,
                    kakao_category_name,
                    recommend_pct,
                    status
                `,
                [existingSpot.spot_id, selectedAddress]
            );

            currentSpot = updatedSpotResult.rows[0];
        }

        const { status, ...spot } = currentSpot;

        return res.json({
            success: true,
            is_created: false,
            spot: {
                ...spot,
                recommend_pct: spot.recommend_pct === null
                    ? null
                    : Number(spot.recommend_pct),
            },
        });
    } catch (error) {
        console.error(error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to save Kakao spot',
        });
    }
});

module.exports = router;
