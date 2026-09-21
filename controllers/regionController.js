const {
  SUPPORTED_REGION_LIST,
  SEOUL_DISTRICTS,
  CHUNCHEON_AREAS,
  TARGET_REGIONS,
} = require('../constants/spotCategoryRules');

/**
 * GET /api/regions
 * 지원 지역 목록 조회 (전국, 서울특별시 25개 구, 강원특별자치도 춘천시)
 * 프론트엔드 필터링 UI 및 쿼리 파라미터(params) 제공
 */
exports.getRegions = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      total_regions: SUPPORTED_REGION_LIST.length,
      total_cities: SUPPORTED_REGION_LIST.length,
      regions: SUPPORTED_REGION_LIST,
      seoul_districts: SEOUL_DISTRICTS,
      chuncheon_areas: CHUNCHEON_AREAS,
    });
  } catch (err) {
    next(err);
  }
};
