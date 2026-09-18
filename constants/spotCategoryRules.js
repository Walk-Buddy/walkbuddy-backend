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

// 타겟 지역 정의 (서울 전체 + 25개 구 & 강원 춘천시)
// TourAPI 4.0 서울 시군구 코드: areaCode=1, sigunguCode 1~25
const TARGET_REGIONS = {
  // ── 서울 전체 (구 미지정, 서울 전역 조회) ──────────────────────
  SEOUL: {
    code: 'seoul',
    name: '서울',
    fullName: '서울특별시',
    tourApi: { areaCode: '1', sigunguCode: null }, // sigunguCode 없이 서울 전체 조회
    durunubi: { sigun: '서울특별시' },
    aliases: ['서울', 'seoul', '서울특별시', 'seoul_all'],
  },
  // ── 서울 25개 구 ────────────────────────────────────────────────
  GANGNAM: {
    code: 'gangnam',
    name: '강남구',
    fullName: '서울특별시 강남구',
    tourApi: { areaCode: '1', sigunguCode: '1' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['강남', '강남구', 'gangnam'],
  },
  GANGDONG: {
    code: 'gangdong',
    name: '강동구',
    fullName: '서울특별시 강동구',
    tourApi: { areaCode: '1', sigunguCode: '2' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['강동', '강동구', 'gangdong'],
  },
  GANGBUK: {
    code: 'gangbuk',
    name: '강북구',
    fullName: '서울특별시 강북구',
    tourApi: { areaCode: '1', sigunguCode: '3' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['강북', '강북구', 'gangbuk'],
  },
  GANGSEO: {
    code: 'gangseo',
    name: '강서구',
    fullName: '서울특별시 강서구',
    tourApi: { areaCode: '1', sigunguCode: '4' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['강서', '강서구', 'gangseo'],
  },
  GWANAK: {
    code: 'gwanak',
    name: '관악구',
    fullName: '서울특별시 관악구',
    tourApi: { areaCode: '1', sigunguCode: '5' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['관악', '관악구', 'gwanak'],
  },
  GWANGJIN: {
    code: 'gwangjin',
    name: '광진구',
    fullName: '서울특별시 광진구',
    tourApi: { areaCode: '1', sigunguCode: '6' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['광진', '광진구', 'gwangjin'],
  },
  GURO: {
    code: 'guro',
    name: '구로구',
    fullName: '서울특별시 구로구',
    tourApi: { areaCode: '1', sigunguCode: '7' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['구로', '구로구', 'guro'],
  },
  GEUMCHEON: {
    code: 'geumcheon',
    name: '금천구',
    fullName: '서울특별시 금천구',
    tourApi: { areaCode: '1', sigunguCode: '8' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['금천', '금천구', 'geumcheon'],
  },
  NOWON: {
    code: 'nowon',
    name: '노원구',
    fullName: '서울특별시 노원구',
    tourApi: { areaCode: '1', sigunguCode: '9' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['노원', '노원구', 'nowon', 'seoul_nowon'],
  },
  DOBONG: {
    code: 'dobong',
    name: '도봉구',
    fullName: '서울특별시 도봉구',
    tourApi: { areaCode: '1', sigunguCode: '10' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['도봉', '도봉구', 'dobong'],
  },
  DONGDAEMUN: {
    code: 'dongdaemun',
    name: '동대문구',
    fullName: '서울특별시 동대문구',
    tourApi: { areaCode: '1', sigunguCode: '11' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['동대문', '동대문구', 'dongdaemun'],
  },
  DONGJAK: {
    code: 'dongjak',
    name: '동작구',
    fullName: '서울특별시 동작구',
    tourApi: { areaCode: '1', sigunguCode: '12' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['동작', '동작구', 'dongjak'],
  },
  MAPO: {
    code: 'mapo',
    name: '마포구',
    fullName: '서울특별시 마포구',
    tourApi: { areaCode: '1', sigunguCode: '13' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['마포', '마포구', 'mapo'],
  },
  SEODAEMUN: {
    code: 'seodaemun',
    name: '서대문구',
    fullName: '서울특별시 서대문구',
    tourApi: { areaCode: '1', sigunguCode: '14' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['서대문', '서대문구', 'seodaemun'],
  },
  SEOCHO: {
    code: 'seocho',
    name: '서초구',
    fullName: '서울특별시 서초구',
    tourApi: { areaCode: '1', sigunguCode: '15' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['서초', '서초구', 'seocho'],
  },
  SEONGDONG: {
    code: 'seongdong',
    name: '성동구',
    fullName: '서울특별시 성동구',
    tourApi: { areaCode: '1', sigunguCode: '16' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['성동', '성동구', 'seongdong'],
  },
  SEONGBUK: {
    code: 'seongbuk',
    name: '성북구',
    fullName: '서울특별시 성북구',
    tourApi: { areaCode: '1', sigunguCode: '17' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['성북', '성북구', 'seongbuk'],
  },
  SONGPA: {
    code: 'songpa',
    name: '송파구',
    fullName: '서울특별시 송파구',
    tourApi: { areaCode: '1', sigunguCode: '18' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['송파', '송파구', 'songpa'],
  },
  YANGCHEON: {
    code: 'yangcheon',
    name: '양천구',
    fullName: '서울특별시 양천구',
    tourApi: { areaCode: '1', sigunguCode: '19' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['양천', '양천구', 'yangcheon'],
  },
  YEONGDEUNGPO: {
    code: 'yeongdeungpo',
    name: '영등포구',
    fullName: '서울특별시 영등포구',
    tourApi: { areaCode: '1', sigunguCode: '20' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['영등포', '영등포구', 'yeongdeungpo'],
  },
  YONGSAN: {
    code: 'yongsan',
    name: '용산구',
    fullName: '서울특별시 용산구',
    tourApi: { areaCode: '1', sigunguCode: '21' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['용산', '용산구', 'yongsan'],
  },
  EUNPYEONG: {
    code: 'eunpyeong',
    name: '은평구',
    fullName: '서울특별시 은평구',
    tourApi: { areaCode: '1', sigunguCode: '22' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['은평', '은평구', 'eunpyeong'],
  },
  JONGNO: {
    code: 'jongno',
    name: '종로구',
    fullName: '서울특별시 종로구',
    tourApi: { areaCode: '1', sigunguCode: '23' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['종로', '종로구', 'jongno'],
  },
  JUNG: {
    code: 'jung',
    name: '중구',
    fullName: '서울특별시 중구',
    tourApi: { areaCode: '1', sigunguCode: '24' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['중구', 'jung', '서울중구'],
  },
  JUNGNANG: {
    code: 'jungnang',
    name: '중랑구',
    fullName: '서울특별시 중랑구',
    tourApi: { areaCode: '1', sigunguCode: '25' },
    durunubi: { sigun: '서울특별시' },
    aliases: ['중랑', '중랑구', 'jungnang'],
  },
  // ── 강원 춘천시 ─────────────────────────────────────────────────
  CHUNCHEON: {
    code: 'chuncheon',
    name: '춘천시',
    fullName: '강원특별자치도 춘천시',
    tourApi: { areaCode: '32', sigunguCode: '13' },
    durunubi: { sigun: '춘천시' },
    aliases: ['춘천', '춘천시', 'chuncheon', 'gangwon_chuncheon'],
  },
};

/**
 * region 문자열을 받아 TARGET_REGIONS 항목을 반환합니다.
 * - '서울' / 'seoul' → SEOUL (전 구 조회, sigunguCode 없음)
 * - '강남구' / '강남' → GANGNAM
 * - '춘천' / '춘천시' → CHUNCHEON
 * - 매칭 없으면 null 반환 (caller에서 처리)
 */
function resolveRegion(regionInput) {
  if (!regionInput) return null;
  const normalized = String(regionInput).trim().toLowerCase();

  for (const regionKey of Object.keys(TARGET_REGIONS)) {
    const r = TARGET_REGIONS[regionKey];
    if (r.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return r;
    }
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

// ── 서울 25개 자치구 목록 ──────────────────────────────────────────
const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구',
  '광진구', '구로구', '금천구', '노원구', '도봉구',
  '동대문구', '동작구', '마포구', '서대문구', '서초구',
  '성동구', '성북구', '송파구', '양천구', '영등포구',
  '용산구', '은평구', '종로구', '중구', '중랑구',
];

// ── 춘천 주요 권역 목록 ────────────────────────────────────────────
const CHUNCHEON_AREAS = [
  '의암호·공지천권',
  '소양강·신북권',
  '도심·명동권',
  '동면·구봉산권',
  '강촌·남산권',
];

// ── 지원 지역 전체 구조 (클라이언트 전달용) ──────────────────────────
const SUPPORTED_REGION_LIST = [
  {
    code: 'seoul',
    name: '서울',
    fullName: '서울특별시',
    sub_regions: SEOUL_DISTRICTS,
  },
  {
    code: 'chuncheon',
    name: '춘천',
    fullName: '강원특별자치도 춘천시',
    sub_regions: CHUNCHEON_AREAS,
  },
];

/**
 * 주소(address) 또는 장소명 문자열에서 region('서울' | '춘천')과 sub_region을 자동 추출합니다.
 */
function extractRegionFromAddress(addressOrText = '') {
  if (!addressOrText || typeof addressOrText !== 'string') {
    return { region: '서울', sub_region: null };
  }

  const text = addressOrText.trim();

  // 1. 춘천 확인
  if (text.includes('춘천') || text.includes('강원특별자치도 춘천') || text.includes('강원도 춘천')) {
    let matchedSub = null;
    if (text.includes('의암') || text.includes('공지천') || text.includes('삼천동') || text.includes('근화동') || text.includes('칠전동')) {
      matchedSub = '의암호·공지천권';
    } else if (text.includes('소양') || text.includes('신북') || text.includes('사북') || text.includes('우두동') || text.includes('신사우동')) {
      matchedSub = '소양강·신북권';
    } else if (text.includes('명동') || text.includes('중앙로') || text.includes('효자') || text.includes('퇴계') || text.includes('석사') || text.includes('온의') || text.includes('약사')) {
      matchedSub = '도심·명동권';
    } else if (text.includes('구봉산') || text.includes('동면') || text.includes('만천') || text.includes('장학')) {
      matchedSub = '동면·구봉산권';
    } else if (text.includes('강촌') || text.includes('남산') || text.includes('남면') || text.includes('김유정') || text.includes('신동면')) {
      matchedSub = '강촌·남산권';
    }
    return { region: '춘천', sub_region: matchedSub };
  }

  // 2. 서울 확인
  for (const district of SEOUL_DISTRICTS) {
    if (text.includes(district) || text.includes(district.replace('구', ''))) {
      return { region: '서울', sub_region: district };
    }
  }

  if (text.includes('서울')) {
    return { region: '서울', sub_region: null };
  }

  return { region: '서울', sub_region: null };
}

module.exports = {
  SPOT_CATEGORIES,
  TARGET_REGIONS,
  SEOUL_DISTRICTS,
  CHUNCHEON_AREAS,
  SUPPORTED_REGION_LIST,
  resolveRegion,
  extractRegionFromAddress,
  SPOT_CATEGORY_SEARCH_RULES,
  getLastCategory,
  getFallbackCategory,
  inferSpotCategories,
  inferSpotCategoriesWithFallback,
};

