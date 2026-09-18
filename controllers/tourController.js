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

exports.getTourSpots = async (req, res, next) => {
  try {
    const result = await tourApiService.getTourSpots(req.query);
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
