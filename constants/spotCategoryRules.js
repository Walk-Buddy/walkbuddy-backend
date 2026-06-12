//사용자가 선택할 수 있는 장소(스팟) 카테고리 목록

const SPOT_CATEGORIES=[
  '산',
  '숲·휴양림',
  '수목원·정원',
  '강·하천',
  '호수·저수지',
  '계곡·폭포',
  '해수욕장·해변',
  '생태·서식지',
  '공원·광장',
];

//스팟 카테고리별 카카오 API 키워드 검색에 사용할 query 목록
//category_group_code=AT4 카카오 장소 카테고리 중 '관광명소'를 의미

const SPOT_CATEGORY_SEARCH_RULES={
    '산':[
        {query: '산', category_group_code:'AT4'},
        {query: '오름'},
        {query:'산봉우리'},
        {query:'등산로'},
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
  ],

  '호수·저수지': [
    { query: '호수', category_group_code: 'AT4' },
    { query: '저수지', category_group_code: 'AT4' },
    { query: '연못' },
    { query: '호수공원' },
  ],

  '계곡·폭포': [
    { query: '계곡', category_group_code: 'AT4' },
    { query: '계곡' },
    { query: '폭포' },
  ],

  '해수욕장·해변': [
    { query: '해수욕장', category_group_code: 'AT4' },
    { query: '해변', category_group_code: 'AT4' },
  ],

  '생태·서식지': [
    { query: '생태공원' },
    { query: '습지' },
    { query: '서식지' },
    { query: '자연생태' },
    { query: '철새', category_group_code: 'AT4' },
    { query: '생태', category_group_code: 'AT4' },
  ],

  '공원·광장': [
    { query: '공원' },
    { query: '도시근린공원' },
    { query: '광장' },
    { query: '한강공원' },
    { query: '호수공원' },
    { query: '생태공원' },
    { query: '수변공원' },
  ],
};


// 카카오 categoryName 문자열에서 마지막 카테고리 추출, category 값으로 사용
//EX) 여행 > 관광,명소 > 강 -> 강
function getLastCategory(categoryName=''){
    return categoryName.split('>').pop().trim();
}

function getFallbackCategory(categoryName = '') {
    const parts = categoryName.split('>').map(part => part.trim()).filter(Boolean);
    return parts[2] || parts[1] || '';
}

function includesAny(text='', keywords=[]){
    return keywords.some(keyword=> text.includes(keyword));   
}

const EXCLUDED_PLACE_KEYWORDS=[
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
  '카페',
  '식당',
  '편의점',
  '공인중개사',
  '약국',
  '교회',
  '주유소',
  '도서관',
  '사우나',
  '빌딩',
];

function isExcludedKakaoPlace(kakaoPlace = {}) {
  const placeName = kakaoPlace.place_name || '';
  const categoryName = kakaoPlace.category_name || '';
  return includesAny(placeName, EXCLUDED_PLACE_KEYWORDS) || includesAny(categoryName, EXCLUDED_PLACE_KEYWORDS);
}

//카카오 장소 응답을 앱 스팟 카테고리 배열로 변환
function inferSpotCategories(kakaoPlace={}){
    const placeName=kakaoPlace.place_name || '';
    const categoryName=kakaoPlace.category_name || '';
    const lastCategory=getLastCategory(categoryName);

//EXCLUDED_PLACE_KEYWORDS에 포함된 장소는 제외
    if(isExcludedKakaoPlace(kakaoPlace)){
        return [];
    }

//한 장소가 여러 카테고리에 속할 수 있으므로 배열로 저장

const categories=[];

//산
if(['산','오름','산봉우리'].includes(lastCategory)){
    categories.push('산');
}
if(
    lastCategory==='등산로'&&
    includesAny(placeName,['입구', '쉼터', '고개', '정상', '전망대'])&&
    !includesAny(placeName,['코스', '구간', '둘레길', '종주', '탐방로'])
){
    categories.push('산');
}

//숲·휴양림
if (['숲','자연휴양림'].includes(lastCategory)){
    categories.push('숲·휴양림');
}

if(
    ['도보여행', '둘레길', '서울둘레길', '무장애나눔길'].includes(lastCategory)&&
    includesAny(placeName,['숲길', '산책길', '나들길', '산책로', '무장애숲길', '치유의 숲', '치유의숲'] )&&
    !includesAny(placeName,['코스', '구간', '서울둘레길', '북한산둘레길', '관악산둘레길'])
){
    categories.push('숲·휴양림');
}

 // 수목원·정원
  if (['수목원,식물원', '국가정원'].includes(lastCategory)) {
    categories.push('수목원·정원');
  }

  if (lastCategory === '관광농원' && placeName.includes('정원')) {
    categories.push('수목원·정원');
  }

  if (
    lastCategory === '도보여행' &&
    placeName.includes('정원') &&
    !includesAny(placeName, ['코스', '구간', '둘레길'])
  ) {
    categories.push('수목원·정원');
  }

  // 강·하천
  if (['강', '하천'].includes(lastCategory)) {
    categories.push('강·하천');
  }

  if (includesAny(placeName, ['한강공원', '강변공원', '수변공원', '천변공원', '하천공원'])) {
    categories.push('강·하천');
  }

  // 호수·저수지
  if (['호수', '저수지', '연못'].includes(lastCategory)) {
    categories.push('호수·저수지');
  }

  if (placeName.includes('호수공원')) {
    categories.push('호수·저수지');
  }

  // 계곡·폭포
  if (['계곡', '폭포'].includes(lastCategory)) {
    categories.push('계곡·폭포');
  }

  if (lastCategory === '관광,명소' && placeName.includes('계곡')) {
    categories.push('계곡·폭포');
  }

  if (placeName.includes('폭포공원')) {
    categories.push('계곡·폭포');
  }

  // 해수욕장·해변
  if (lastCategory === '해수욕장,해변') {
    categories.push('해수욕장·해변');
  }

  // 생태·서식지
  if (lastCategory === '생태보존,서식지') {
    categories.push('생태·서식지');
  }

  if (includesAny(placeName, ['생태공원', '생태습지', '습지공원', '서식지', '철새', '갈대', '람사르'])) {
    categories.push('생태·서식지');
  }

  if (
    ['연못', '저수지', '수목원,식물원', '전망대'].includes(lastCategory) &&
    includesAny(placeName, ['생태', '습지', '철새조망대'])
  ) {
    categories.push('생태·서식지');
  }

  // 공원·광장
  if (['공원', '도시근린공원', '광장'].includes(lastCategory)) {
    categories.push('공원·광장');
  }

  //중복된 카테고리 제거
  return [...new Set(categories)];
}

function inferSpotCategoriesWithFallback(kakaoPlace = {}) {
  const appCategories = inferSpotCategories(kakaoPlace);
  if (appCategories.length > 0) return appCategories;
  if (isExcludedKakaoPlace(kakaoPlace)) return [];

  const fallbackCategory = getFallbackCategory(kakaoPlace.category_name || '');
  return fallbackCategory ? [fallbackCategory] : [];
}

module.exports={
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    getLastCategory,
    getFallbackCategory,
    inferSpotCategories,
    inferSpotCategoriesWithFallback,
};
