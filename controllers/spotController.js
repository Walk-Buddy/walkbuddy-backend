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

        // DB에서 스팟 이름과 tour_api_content_id 조회
        // tour_api_content_id는 spots 테이블 컬럼이 없어서 content_tour로 연결된 경우를 고려,
        // 현재는 이름만 사용해 galleryList1 fallback으로 처리
        const { rows } = await pool.query(
            `SELECT name FROM spots WHERE spot_id = $1 AND status = 'active'`,
            [spot_id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: '스팟을 찾을 수 없습니다.' });
        }

        const { name } = rows[0];

        // content_id는 DB 컬럼이 없어 null → getSpotPhotos 내부에서 galleryList1 fallback 실행
        const result = await tourApiService.getSpotPhotos(null, name);

        return res.json({ success: true, spot_id, spot_name: name, ...result });
    } catch (err) { next(err); }
};
