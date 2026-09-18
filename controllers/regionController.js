const {
  SUPPORTED_REGION_LIST,
  SEOUL_DISTRICTS,
  CHUNCHEON_AREAS,
  TARGET_REGIONS,
} = require('../constants/spotCategoryRules');

/**
 * GET /api/regions
 * 지원 지역 목록 조회 (서울 25개 구 + 춘천 주요 권역)
 */
exports.getRegions = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      total_cities: SUPPORTED_REGION_LIST.length,
      regions: SUPPORTED_REGION_LIST,
      seoul_districts: SEOUL_DISTRICTS,
      chuncheon_areas: CHUNCHEON_AREAS,
    });
  } catch (err) {
    next(err);
  }
};
