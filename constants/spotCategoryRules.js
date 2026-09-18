// 사용자가 선택할 수 있는 장소(스팟) 10대 표준 카테고리 목록
const SPOT_CATEGORIES = [
  '산·등산로',
  '숲·휴양림',
  '수목원·정원',
  '강·하천',
  '호수·저수지',
  '공원·광장',
  '역사·유적',
  '전시·문화공간',
  '카페·맛집',
  '전통시장·로컬마켓',
];

// 타겟 지역 정의 (서울 노원구 & 강원 춘천시)
const TARGET_REGIONS = {
  NOWON: {
    code: 'nowon',
    name: '노원구',
    fullName: '서울특별시 노원구',
    tourApi: { areaCode: '1', sigunguCode: '9' }, // TourAPI 4.0 서울(1) 노원구(9)
    aliases: ['노원', '노원구', 'nowon', 'seoul_nowon', '서울', 'seoul'],
  },
  CHUNCHEON: {
    code: 'chuncheon',
    name: '춘천시',
    fullName: '강원특별자치도 춘천시',
    tourApi: { areaCode: '32', sigunguCode: '13' }, // TourAPI 4.0 강원(32) 춘천시(13)
    aliases: ['춘천', '춘천시', 'chuncheon', 'gangwon_chuncheon'],
  },
};

function resolveRegion(regionInput) {
  if (!regionInput) return null;
  const normalized = String(regionInput).trim().toLowerCase();

  for (const regionKey of Object.keys(TARGET_REGIONS)) {
    const r = TARGET_REGIONS[regionKey];
    if (r.aliases.some((alias) => alias.toLowerCase() === normalized) || normalized.includes(r.name)) {
      return r;
    }
  }

  // 기본 fallback: '서울' 입력 시 노원구 타겟팅
  if (normalized === 'seoul' || normalized === '서울' || normalized === '서울특별시') {
    return TARGET_REGIONS.NOWON;
  }

  return null;
}

// 스팟 카테고리별 카카오 API / TourAPI 키워드 검색 규칙
const SPOT_CATEGORY_SEARCH_RULES = {
  '산·등산로': [
    { query: '산', category_group_code: 'AT4' },
    { query: '오름' },
    { query: '산봉우리' },
    { query: '등산로' },
    { query: '전망대' },
  ],
  '숲·휴양림': [
    { query: '숲', category_group_code: 'AT4' },
    { query: '숲길', category_group_code: 'AT4' },
    { query: '자연휴양림', category_group_code: 'AT4' },
    { query: '산림욕장', category_group_code: 'AT4' },
  ],
  '수목원·정원': [
    { query: '수목원', category_group_code: 'AT4' },
    { query: '식물원', category_group_code: 'AT4' },
    { query: '정원', category_group_code: 'AT4' },
    { query: '국가정원', category_group_code: 'AT4' },
  ],
  '강·하천': [
    { query: '강', category_group_code: 'AT4' },
    { query: '하천' },
    { query: '천변' },
    { query: '당현천' },
    { query: '중랑천' },
    { query: '공지천' },
  ],
  '호수·저수지': [
    { query: '호수', category_group_code: 'AT4' },
    { query: '저수지', category_group_code: 'AT4' },
    { query: '연못' },
    { query: '호수공원' },
  ],
  '공원·광장': [
    { query: '공원' },
    { query: '도시근린공원' },
    { query: '광장' },
    { query: '수변공원' },
  ],
  '역사·유적': [
    { query: '고궁', category_group_code: 'AT4' },
    { query: '사찰', category_group_code: 'AT4' },
    { query: '절', category_group_code: 'AT4' },
    { query: '성곽', category_group_code: 'AT4' },
    { query: '유적지', category_group_code: 'AT4' },
    { query: '태릉' },
    { query: '강릉' },
    { query: '청평사' },
    { query: '사적지', category_group_code: 'AT4' },
  ],
  '전시·문화공간': [
    { query: '박물관', category_group_code: 'CT1' },
    { query: '미술관', category_group_code: 'CT1' },
    { query: '문학관', category_group_code: 'CT1' },
    { query: '전시관', category_group_code: 'CT1' },
    { query: '천문우주과학관' },
  ],
  '카페·맛집': [
    { query: '카페', category_group_code: 'CE7' },
    { query: '전통찻집', category_group_code: 'CE7' },
    { query: '베이커리', category_group_code: 'CE7' },
    { query: '닭갈비' },
  ],
  '전통시장·로컬마켓': [
    { query: '전통시장' },
    { query: '재래시장' },
    { query: '풍물시장' },
    { query: '도깨비시장' },
    { query: '5일장' },
  ],
};

function getLastCategory(categoryName = '') {
  return categoryName.split('>').pop().trim();
}

function getFallbackCategory(categoryName = '') {
  const parts = categoryName.split('>').map((part) => part.trim()).filter(Boolean);
  return parts[2] || parts[1] || '';
}

function includesAny(text = '', keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

const EXCLUDED_PLACE_KEYWORDS = [
  '주차장',
  '화장실',
  '관리사무소',
  '안내소',
  '매표소',
  '정류장',
  '교차로',
  '운동장',
  '축구장',
  '테니스장',
  '농구장',
  '배드민턴장',
  '공인중개사',
  '약국',
  '주유소',
  '사우나',
  '빌딩',
];

function isExcludedKakaoPlace(kakaoPlace = {}) {
  const placeName = kakaoPlace.place_name || '';
  const categoryName = kakaoPlace.category_name || '';
  return includesAny(placeName, EXCLUDED_PLACE_KEYWORDS) || includesAny(categoryName, EXCLUDED_PLACE_KEYWORDS);
}

// 카카오 장소 응답 또는 TourAPI 정보를 앱 스팟 10대 카테고리 배열로 변환
function inferSpotCategories(place = {}) {
  const placeName = place.place_name || place.name || place.title || '';
  const categoryName = place.category_name || place.kakao_category_name || '';
  const lastCategory = getLastCategory(categoryName);

  if (isExcludedKakaoPlace(place)) {
    return [];
  }

  const categories = [];

  // 1. 산·등산로
  if (['산', '오름', '산봉우리'].includes(lastCategory) || includesAny(placeName, ['불암산', '수락산', '봉의산', '삼악산', '산봉우리', '전망대', '정상', '고개'])) {
    categories.push('산·등산로');
  }
  if (
    lastCategory === '등산로' &&
    includesAny(placeName, ['입구', '쉼터', '고개', '정상', '전망대']) &&
    !includesAny(placeName, ['코스', '구간', '둘레길', '종주', '탐방로'])
  ) {
    categories.push('산·등산로');
  }

  // 2. 숲·휴양림
  if (['숲', '자연휴양림'].includes(lastCategory) || includesAny(placeName, ['경춘선숲길', '경춘선 숲길', '자연휴양림', '산림욕장', '치유의숲', '숲길'])) {
    categories.push('숲·휴양림');
  }

  // 3. 수목원·정원
  if (['수목원,식물원', '국가정원'].includes(lastCategory) || includesAny(placeName, ['나비정원', '수목원', '식물원', '화목원', '정원', '제이드가든'])) {
    categories.push('수목원·정원');
  }

  // 4. 강·하천
  if (['강', '하천'].includes(lastCategory) || includesAny(placeName, ['당현천', '중랑천', '공지천', '소양강', '한강', '천변', '수변공원'])) {
    categories.push('강·하천');
  }

  // 5. 호수·저수지
  if (['호수', '저수지', '연못'].includes(lastCategory) || includesAny(placeName, ['의암호', '소양호', '춘천호', '호수공원', '원터근린공원 연못'])) {
    categories.push('호수·저수지');
  }

  // 6. 공원·광장
  if (['공원', '도시근린공원', '광장'].includes(lastCategory) || includesAny(placeName, ['공원', '근린공원', '생태공원', '마을마당', '광장'])) {
    categories.push('공원·광장');
  }

  // 7. 역사·유적 (TourAPI A0201 연계)
  if (
    ['문화유적', '사찰', '성곽', '유적지', '왕릉'].includes(lastCategory) ||
    includesAny(placeName, ['궁', '사찰', '청평사', '조계사', '성곽', '유적', '태릉', '강릉', '왕릉', '신숭겸', '생가', '사적지'])
  ) {
    categories.push('역사·유적');
  }

  // 8. 전시·문화공간 (TourAPI A0206 연계)
  if (
    ['박물관', '미술관', '문화시설', '전시관'].includes(lastCategory) ||
    includesAny(placeName, ['박물관', '미술관', '문학관', '김유정문학촌', '애니메이션박물관', '천문우주과학관', '아트센터', '전시관', '서울시립북서울미술관'])
  ) {
    categories.push('전시·문화공간');
  }

  // 9. 카페·맛집 (TourAPI A0502 연계)
  if (
    ['카페', '디저트', '음식점', '한식', '전통찻집'].includes(lastCategory) ||
    includesAny(categoryName, ['카페', '음식점', '제과,베이커리']) ||
    includesAny(placeName, ['카페거리', '닭갈비', '막국수', '전통찻집', '베이커리', '공릉동 도깨비'])
  ) {
    categories.push('카페·맛집');
  }

  // 10. 전통시장·로컬마켓 (TourAPI A0401 연계)
  if (
    ['전통시장', '재래시장', '시장'].includes(lastCategory) ||
    includesAny(placeName, ['풍물시장', '중앙시장', '도깨비시장', '공릉도깨비시장', '상계중앙시장', '전통시장', '5일장', '상점가'])
  ) {
    categories.push('전통시장·로컬마켓');
  }

  // 기본 fallback: 공원·광장
  if (categories.length === 0 && includesAny(placeName, ['길', '마루', '터', '쉼터'])) {
    categories.push('공원·광장');
  }

  return [...new Set(categories)];
}

function inferSpotCategoriesWithFallback(place = {}) {
  const appCategories = inferSpotCategories(place);
  if (appCategories.length > 0) return appCategories;
  if (isExcludedKakaoPlace(place)) return [];

  const fallbackCategory = getFallbackCategory(place.category_name || '');
  return fallbackCategory ? [fallbackCategory] : ['공원·광장'];
}

module.exports = {
  SPOT_CATEGORIES,
  TARGET_REGIONS,
  resolveRegion,
  SPOT_CATEGORY_SEARCH_RULES,
  getLastCategory,
  getFallbackCategory,
  inferSpotCategories,
  inferSpotCategoriesWithFallback,
};
