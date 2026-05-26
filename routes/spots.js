const express = require('express');
const axios = require('axios');
const pool = require('../config/db');

const {
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    inferSpotCategories,
} = require('../constants/spotCategoryRules');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'spot router connected',
    });
});

//사용자가 선택한 스팟 카테고리에 해당하는 카카오 검색 query 규칙을 확인
router.get('/search', async (req, res) => {
    const { category, x, y, radius } = req.query;

    if (!category) {
        return res.status(400).json({
            success: false,
            message: 'category query parameter is required',
        });
    }

    // 지원하지 않는 카테고리 값은 검색하지 않음
    if (!SPOT_CATEGORIES.includes(category)) {
        return res.status(400).json({
            success: false,
            message: 'unsupported spot category',
            supported_categories: SPOT_CATEGORIES,
        });
    }

    const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;

    //카카오 api 키가 설정되지 않은 경우 에러 응답
    if (!kakaoRestApiKey) {
        return res.status(500).json({
            success: false,
            message: 'Kakao REST API key is not configured',
        });
    }

    //선택한 스팟 카테고리에 해당하는 카카오 검색 규칙 목록 가져옴.
    const rules = SPOT_CATEGORY_SEARCH_RULES[category];

    //여러 query의 카카오 api 응답을 모아둘 배열
    //여러 카카오 query에서 받은 documents를 하나로 합쳐 담을 배열
    const allDocuments = [];

    //카카오 API 호출
    try {
        // 카테고리에 연결된 카카오 검색 규칙을 하나씩 실행
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

            //x, y가 함께 들어오면 현재 위치 기준 거리순 검색으로 요청합니다.
            if (x && y) {
                params.x = x;
                params.y = y;
                params.sort = 'distance';

                //radius가 들어오면 해당 반경 안에서 검색합니다.
                if (radius) {
                    params.radius = radius;
                }
            }

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

        //카카오 장소 id를 기준으로 중복 장소 제거
        const uniqueSpotMap = new Map();

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
                address: document.address_name,
                x: document.x,
                y: document.y,
                distance: document.distance ? Number(document.distance) : null,
            };

            uniqueSpotMap.set(document.id, spot);
        }

        const uniqueSpots = Array.from(uniqueSpotMap.values());

        //카카오 검색 결과 중 이미 DB에 저장된 장소가 있는지 확인
        const kakaoPlaceIds = uniqueSpots.map((spot) => spot.kakao_place_id);

        //DB에 저장된 장소를 kakao_place_id 기준으로 빠르게 찾기 위한 Map
        let savedSpotMap = new Map();

        if (kakaoPlaceIds.length > 0) {
            const savedSpotResult = await pool.query(
                `
                SELECT
                    spot_id,
                    kakao_place_id,
                    name,
                    address,
                    categories,
                    kakao_category_name,
                    recommend_pct
                FROM spots
                WHERE kakao_place_id = ANY($1::TEXT[])
                AND status = 'active'
                `,
                [kakaoPlaceIds]
            );

            //조회된 DB 장소를 kakao_place_id로 바로 찾을 수 있게 Map으로 바꿉니다.
            savedSpotMap = new Map(
                savedSpotResult.rows.map((row) => [row.kakao_place_id, row])
            );
        }

        //카카오 검색 결과에 DB 저장 여부를 붙입니다.
        const spots = uniqueSpots.map((spot) => {
            const savedSpot = savedSpotMap.get(spot.kakao_place_id);

            if (!savedSpot) {
                return {
                    ...spot,
                    is_saved: false,
                    spot_id: null,
                    recommend_pct: null,
                };
            }

            return {
                ...spot,
                is_saved: true,
                spot_id: savedSpot.spot_id,
                name: savedSpot.name,
                address: savedSpot.address,
                categories: savedSpot.categories,
                kakao_category_name: savedSpot.kakao_category_name,
                recommend_pct: savedSpot.recommend_pct === null
                    ? null
                    : Number(savedSpot.recommend_pct),
            };
        });

        //모든 카카오 query 호출이 끝나면 결과 응답
        return res.json({
            success: true,
            category,
            //rules,
            total_count: spots.length,
            raw_count: allDocuments.length,
            spots,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);

        //클라이언트에 통일된 에러 응답 반환
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch data from Kakao API',
        });
    }
});

module.exports = router;
