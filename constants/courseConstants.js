// 코스 표준 카테고리 목록
const COURSE_CATEGORIES = [
  "둘레길·트레킹",
  "도심·골목산책",
  "수변·공원길",
];

// 코스 난이도 정의
const COURSE_DIFFICULTIES = {
  1: "쉬움 (평지/데크길 위주, 경사 완만)",
  2: "보통 (완만한 오르막, 일반 숲길)",
  3: "어려움 (등산로/계단 구간 포함)",
};

// 코스 태그 정의
const COURSE_TAGS = [
  "#추천코스",
  "#힐링",
  "#반려동물",
  "#무장애길",
  "#아이와함께",
];

// 공식 코스(두루누비·전국길관광) 소요시간 계산용 도보 속도 (m/분)
// T맵 도보 길찾기 결과(길관광 6개 코스 합계 16,793m / 224분)와 맞춘 값 ≈ 4.5km/h
const WALK_METERS_PER_MINUTE = 75;

module.exports = {
  WALK_METERS_PER_MINUTE,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTIES,
  COURSE_TAGS,
};
