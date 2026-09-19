const tourApiService = require("../services/tourApiService");

exports.getFestivals = async (req, res, next) => {
  try {
    const result = await tourApiService.getFestivals(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getSpotDetail = async (req, res, next) => {
  try {
    const result = await tourApiService.getSpotDetail(req.params.content_id);
    return res.json({ success: true, spot: result });
  } catch (err) {
    next(err);
  }
};

exports.getBarrierFreeInfo = async (req, res, next) => {
  try {
    const result = await tourApiService.getBarrierFreeInfo(req.params.content_id);
    return res.json({ success: true, barrier_free: result });
  } catch (err) {
    next(err);
  }
};

exports.getBarrierFreeSpots = async (req, res, next) => {
  try {
    const result = await tourApiService.getBarrierFreeSpots(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.searchBarrierFreePlaces = async (req, res, next) => {
  try {
    const result = await tourApiService.searchBarrierFreePlaces(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getTourSpots = async (req, res, next) => {
  try {
    // ── LBS 사업자 미신고 안전 ──────────────────────────────────────────
    // 이용자의 실시간 단말기 GPS 좌표(latitude / longitude / radius)는 서버로 받지 않는다.
    // 거리·반경 계산은 앱(온디바이스)에서만 수행하므로, 좌표성 파라미터는 화이트리스트로 차단한다.
    // 좌표 기반 locationBasedList2 조회는 내부 서버 스크립트가 서비스 계층
    // (tourApiService.getTourSpots)을 직접 호출할 때만 사용한다.
    const {
      region,
      sub_region,
      contentTypeId,
      cat1,
      cat2,
      cat3,
      category,
      tag_ids,
      min_recommend_pct,
      page,
      limit,
    } = req.query;
    const result = await tourApiService.getTourSpots({
      region,
      sub_region,
      contentTypeId,
      cat1,
      cat2,
      cat3,
      category,
      tag_ids,
      min_recommend_pct,
      page,
      limit,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.searchTourPlaces = async (req, res, next) => {
  try {
    const result = await tourApiService.searchTourPlaces(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// ── 반려동물 동반여행 API 컨트롤러 ────────────────────────────────────

exports.getPetTourDetail = async (req, res, next) => {
  try {
    const result = await tourApiService.getPetTourDetail(req.params.content_id);
    return res.json({ success: true, pet_tour: result });
  } catch (err) {
    next(err);
  }
};

exports.getPetTourSpots = async (req, res, next) => {
  try {
    const result = await tourApiService.getPetTourSpots(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.searchPetTourPlaces = async (req, res, next) => {
  try {
    const result = await tourApiService.searchPetTourPlaces(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};
