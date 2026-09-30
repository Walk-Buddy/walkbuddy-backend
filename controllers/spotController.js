const spotService = require('../services/spotService');
const aiContentService = require('../services/aiContentService');
const tourApiService = require('../services/tourApiService');
const pool = require('../config/db');

exports.getSpots = async (req, res, next) => {
    try {
        const result = await spotService.getSpots(req.query);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
};

exports.getSpotById = async (req, res, next) => {
    try {
        const spot = await spotService.getSpotById(req.params.spot_id);
        return res.json({ success: true, spot });
    } catch (err) { next(err); }
};

exports.createSpot = async (req, res, next) => {
    try {
        const { name, x, y } = req.body;
        if (!name || x == null || y == null) {
            return res.status(400).json({ success: false, message: 'name, x, y는 필수입니다.' });
        }
        const spot = await spotService.createSpot(req.body);
        return res.status(201).json({ success: true, spot });
    } catch (err) { next(err); }
};

exports.saveKakaoSpot = async (req, res, next) => {
    try {
        const { kakao_place_id, name, x, y } = req.body;
        if (!kakao_place_id || !name || x == null || y == null) {
            return res.status(400).json({ success: false, message: 'kakao_place_id, name, x, y are required' });
        }
        const result = await spotService.saveKakaoSpot(req.body, req.user.user_id);
        return res.status(result.is_created ? 201 : 200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

exports.searchSpots = async (req, res, next) => {
    try {
        const { category, keyword, q } = req.query;
        if (!category && !keyword && !q) {
            return res.status(400).json({ success: false, message: 'category or keyword query parameter is required' });
        }
        const result = await spotService.searchSpots(req.query);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
};

exports.getAiContents = async (req, res, next) => {
    try {
        const result = await aiContentService.getAiContents(req.params.spot_id);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
};

// 스팟 사진 조회 (TourAPI 혼합 전략)
exports.getSpotPhotos = async (req, res, next) => {
    try {
        const { spot_id } = req.params;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(spot_id).trim());

        if (!isUuid) {
            if (/^\d+$/.test(String(spot_id).trim())) {
                const result = await tourApiService.getSpotPhotos(spot_id, null);
                return res.json({ success: true, spot_id, spot_name: '', ...result });
            }
            return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
        }

                // DB에서 스팟 이름(first_image 포함) 조회
        //  - spots 테이블에는 tour_api_content_id 컬럼이 없다.
        //  - 대표사진(first_image)이 백필되어 있으면 그 사진을 최우선 반환한다(가장 정확).
        //  - 없으면 이름 → TourAPI 키워드검색 → contentId → detailImage2 순으로 시도한다.
        const { rows } = await pool.query(
            `SELECT name, first_image FROM spots WHERE spot_id = $1 AND status = 'active'`,
            [spot_id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
        }

        const { name, first_image } = rows[0];

        // 1순위: DB에 저장된 대표사진(first_image)
        if (first_image) {
            return res.json({
                success: true,
                spot_id,
                spot_name: name,
                source: "db.first_image",
                photos: [{ thumbnail: first_image, original: first_image, title: name }],
            });
        }

        // 2순위: 이름으로 TourAPI 관광지 키워드 검색 → contentId 확보
        //        (galleryList1 키워드 사진검색은 스팟명이 정확히 일치해야 해서 대부분 비어 있음)
        let contentId = null;
        try {
            const candidates = await tourApiService.searchTourPlaces({ keyword: name, limit: 5 });
            const list = candidates.spots || [];
            const exact = list.find(
                (s) => s.title && (s.title === name || s.title.includes(name) || name.includes(s.title))
            );
            contentId = (exact || list[0])?.content_id || null;
        } catch (e) {
            // 키워드 검색 실패는 치명적이지 않으므로 무시하고 다음 폴백으로 진행
            console.warn('[getSpotPhotos] 키워드 검색 실패:', e.message);
        }

        // 3순위: contentId가 있으면 detailImage2, 없으면 내부에서 galleryList1 fallback
        const result = await tourApiService.getSpotPhotos(contentId, name);

        // 대표사진이 비어 있던 스팟이면 확보한 결과를 first_image로 백필(다음 목록 노출 개선)
        const firstPhoto = result?.photos?.[0];
        if (firstPhoto?.original) {
            pool.query(
                `UPDATE spots SET first_image = $2 WHERE spot_id = $1 AND first_image IS NULL`,
                [spot_id, firstPhoto.original]
            ).catch(() => {});
        }

        return res.json({ success: true, spot_id, spot_name: name, ...result });
    } catch (err) { next(err); }
};

// 스팟 개요 AI 5~6줄 요약 (Gemini)
exports.summarizeOverview = async (req, res, next) => {
    try {
        const { spot_id, text, name } = req.body;
        let overviewText = text;
        let spotName = name || '';

        // text가 없는 경우 spot_id를 통해 조회 시도
        if (!overviewText && spot_id) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(spot_id).trim());
            if (isUuid) {
                const spot = await spotService.getSpotById(spot_id);
                overviewText = spot.content_tour || spot.content_place || spot.overview || '';
                spotName = spotName || spot.name || '';
            } else if (/^\d+$/.test(String(spot_id).trim())) {
                const tourDetail = await tourApiService.getSpotDetail(spot_id);
                overviewText = tourDetail.overview || '';
                spotName = spotName || tourDetail.title || '';
            }
        }

        if (!overviewText || !overviewText.trim()) {
            return res.json({
                success: true,
                ai_overview: '',
                message: '요약할 개요 텍스트가 없습니다.'
            });
        }

        const aiOverview = await aiContentService.summarizeOverview(overviewText, spotName, spot_id);

        return res.json({
            success: true,
            spot_id: spot_id || null,
            ai_overview: aiOverview
        });
    } catch (err) {
        next(err);
    }
};
