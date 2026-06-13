const spotService = require('../services/spotService');
const aiContentService = require('../services/aiContentService');

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

exports.filterSpots = async (req, res, next) => {
    try {
        const result = await spotService.filterSpots(req.query);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
};

exports.getAiContents = async (req, res, next) => {
    try {
        const result = await aiContentService.getAiContents(req.params.spot_id);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
};
