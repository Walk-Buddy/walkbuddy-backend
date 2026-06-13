require('dotenv').config();

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE_URL = process.env.SEED_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const COURSE_USER_ID =
  process.env.PREWALK_COURSE_USER_ID || process.env.PREWALK_USER_ID || '00000000-0000-4000-8000-000000000002';
const REVIEW_USER_ID =
  process.env.PREWALK_REVIEW_USER_ID || '00000000-0000-4000-8000-000000000003';
const USER_ROLE = process.env.PREWALK_USER_ROLE || 'user';
const MODE = process.argv.includes('--reviews-only')
  ? 'reviews-only'
  : process.argv.includes('--with-reviews')
    ? 'with-reviews'
    : 'course-only';

const COURSE_NAME = '서울여대 주변 저녁 산책';
const COURSE_DESCRIPTION =
  '서울여대 근처에서 가볍게 걷기 좋은 코스예요. 노원불빛정원에서 야경 보고 화랑대 철도공원을 산책한 다음, 테르미니 서울여대점에서 저녁까지 먹을 수 있어요.';

const PLAN_SPOTS = [
  { label: '노원불빛정원', query: '노원불빛정원', expectedName: '노원불빛정원' },
  { label: '화랑대 철도 공원', query: '화랑대 철도공원', expectedName: '화랑대철도공원' },
  { label: '화랑대 역사 전시관', query: '화랑대 역사전시관', expectedName: '화랑대역사전시관' },
  { label: '테르미니 서울여대점', query: '테르미니 서울여대점', expectedName: '테르미니' },
];

const EXTRA_WALK_SPOTS = [
  { label: '카페 기차가 있는 풍경', query: '카페 기차가 있는 풍경', expectedName: '카페기차가있는풍경' },
  { label: '경춘선 숲길 갤러리', query: '경춘선 숲길 갤러리', expectedName: '경춘선숲길갤러리' },
];

const COURSE_REVIEW = {
  description: '학교 근처에서 부담 없이 걷기 좋은 코스였어요. 불빛정원 야경이 예쁘고 철도공원 쪽 길도 잘 정리돼 있어서 저녁 산책으로 추천합니다.',
  difficulty: 'easy',
  rating: 4.5,
  is_public: true,
};

const SPOT_REVIEWS = {
  '노원불빛정원': {
    description: '밤에 가니까 조명이 예뻐서 사진 찍기 좋았어요. 산책 시작 지점으로 잡기 괜찮았습니다.',
    is_recommended: true,
    is_public: true,
  },
  '화랑대 철도 공원': {
    description: '기차 전시가 있어서 그냥 걷기만 해도 볼거리가 있었어요. 길이 넓고 분위기도 차분해서 좋았습니다.',
    is_recommended: true,
    is_public: true,
  },
  '화랑대 역사 전시관': {
    description: '기대보다 볼거리가 많지는 않아서 일부러 들르기보다는 철도공원 산책 중에 시간이 남으면 가볍게 보는 정도가 좋을 것 같아요.',
    is_recommended: false,
    is_public: true,
  },
  '테르미니 서울여대점': {
    description: '산책 끝나고 저녁 먹기 좋았어요. 파스타랑 피자 메뉴가 있어서 친구랑 같이 가기 괜찮았습니다.',
    is_recommended: true,
    is_public: true,
  },
};

function requireEnv() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET이 .env에 없습니다.');
  }
}

function createAccessToken(userId) {
  return jwt.sign(
    { user_id: userId, role: USER_ROLE },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function createApi(userId) {
  const token = createAccessToken(userId);
  return axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeName(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase();
}

function pickBestSpot(spots, expectedName) {
  const expected = normalizeName(expectedName);
  return (
    spots.find((spot) => normalizeName(spot.name) === expected) ||
    spots.find((spot) => normalizeName(spot.name).includes(expected)) ||
    spots.find((spot) => expected.includes(normalizeName(spot.name))) ||
    spots[0]
  );
}

function pickReviewForSpot(spot) {
  const normalizedSpotName = normalizeName(spot.spot_name || spot.name);
  const matchedLabel = Object.keys(SPOT_REVIEWS).find((label) => {
    const normalizedLabel = normalizeName(label);
    return normalizedSpotName.includes(normalizedLabel) || normalizedLabel.includes(normalizedSpotName);
  });

  return matchedLabel ? SPOT_REVIEWS[matchedLabel] : null;
}

async function searchSpot(api, spotPlan) {
  const { data } = await api.get('/api/spots/search', {
    params: { keyword: spotPlan.query },
  });

  const spots = data.spots || [];
  if (spots.length === 0) {
    throw new Error(`${spotPlan.label} 검색 결과가 없습니다.`);
  }

  const picked = pickBestSpot(spots, spotPlan.expectedName);
  if (!picked) {
    throw new Error(`${spotPlan.label} 검색 결과를 선택하지 못했습니다.`);
  }

  return picked;
}

async function saveSpotIfNeeded(api, spot) {
  if (spot.is_saved && spot.spot_id) {
    return spot;
  }

  if (!spot.kakao_place_id) {
    throw new Error(`${spot.name}은 kakao_place_id가 없어 저장할 수 없습니다.`);
  }

  const { data } = await api.post('/api/spots/kakao', {
    kakao_place_id: spot.kakao_place_id,
    name: spot.name,
    kakao_category_name: spot.kakao_category_name,
    categories: spot.categories,
    address: spot.address,
    x: spot.x,
    y: spot.y,
  });

  return data.spot;
}

async function findExistingCourse(api) {
  const { data } = await api.get('/api/courses/search', {
    params: { keyword: COURSE_NAME, sort: 'latest', limit: 10 },
  });

  return (data.courses || []).find((course) => course.name === COURSE_NAME) || null;
}

function buildGpsPoints(spots) {
  return spots.map((spot) => ({
    lat: Number(spot.y ?? spot.spot_lat),
    lng: Number(spot.x ?? spot.spot_lng),
  }));
}

async function createCompletedWalk(api, courseId, spots) {
  const startResponse = await api.post('/api/walks', { course_id: courseId });
  const walkRecordId = startResponse.data.walk_record_id;

  const endResponse = await api.patch(`/api/walks/${walkRecordId}/end`, {
    gps_points: buildGpsPoints(spots),
  });

  console.log('completed walk:', endResponse.data);
  return walkRecordId;
}

async function createCourseReview(api, courseId, walkRecordId) {
  const response = await api.post(`/api/courses/${courseId}/reviews`, {
    walk_record_id: walkRecordId,
    ...COURSE_REVIEW,
  });

  console.log('created course review:', response.data);
}

async function createSpotReviews(api, spots, walkRecordId) {
  for (const spot of spots) {
    const review = spot.label ? SPOT_REVIEWS[spot.label] : pickReviewForSpot(spot);
    if (!review) continue;

    const response = await api.post(`/api/spots/${spot.spot_id}/reviews`, {
      walk_record_id: walkRecordId,
      ...review,
    });

    console.log(`created spot review: ${spot.name}`, response.data);
  }
}

async function saveExtraWalkSpots(api) {
  const savedSpots = [];
  for (const spotPlan of EXTRA_WALK_SPOTS) {
    const candidate = await searchSpot(api, spotPlan);
    const savedSpot = await saveSpotIfNeeded(api, candidate);
    savedSpots.push({ ...savedSpot, label: spotPlan.label });
    console.log(`saved extra walk spot: ${savedSpot.name} (${savedSpot.spot_id})`);
  }
  return savedSpots;
}

async function generateAiContents(api, spots) {
  for (const spot of spots) {
    const spotId = spot.spot_id;
    const spotName = spot.label || spot.spot_name || spot.name || spotId;
    if (!spotId) continue;

    const { data } = await api.get(`/api/spots/${spotId}/ai-contents`);
    console.log(`generated ai contents: ${spotName}`, {
      spot_id: data.spot_id,
      count: data.contents?.length || 0,
      content_types: (data.contents || []).map((content) => content.content_type),
    });
  }
}

async function createPrewalkCourse(api) {
  const extraSpots = await saveExtraWalkSpots(api);

  const existingCourse = await findExistingCourse(api);
  if (existingCourse) {
    console.log('existing course:', existingCourse);
    const { data: courseDetail } = await api.get(`/api/courses/${existingCourse.course_id}`);
    const courseSpots = (courseDetail.waypoints || [])
      .filter((waypoint) => waypoint.type === 'spot' && waypoint.spot_id)
      .map((waypoint) => ({
        spot_id: waypoint.spot_id,
        spot_name: waypoint.spot_name,
      }));
    await generateAiContents(api, [...courseSpots, ...extraSpots]);
    return existingCourse;
  }

  const savedSpots = [];
  for (const spotPlan of PLAN_SPOTS) {
    const candidate = await searchSpot(api, spotPlan);
    const savedSpot = await saveSpotIfNeeded(api, candidate);
    savedSpots.push({ ...savedSpot, label: spotPlan.label });
    console.log(`saved spot: ${savedSpot.name} (${savedSpot.spot_id})`);
  }

  const waypoints = savedSpots.map((spot) => ({
    type: 'spot',
    spot_id: spot.spot_id,
  }));

  const previewResponse = await api.post('/api/courses/preview', { waypoints });
  console.log('course preview:', previewResponse.data);

  const courseResponse = await api.post('/api/courses', {
    name: COURSE_NAME,
    description: COURSE_DESCRIPTION,
    category: '도심산책',
    is_public: true,
    waypoints,
  });

  console.log('created course:', courseResponse.data);
  await generateAiContents(api, [...savedSpots, ...extraSpots]);
  return courseResponse.data;
}

async function createPrewalkReviews(api) {
  const course = await findExistingCourse(api);
  if (!course) {
    throw new Error(`후기를 남길 코스를 찾지 못했습니다: ${COURSE_NAME}`);
  }

  const { data: courseDetail } = await api.get(`/api/courses/${course.course_id}`);
  const spots = (courseDetail.waypoints || [])
    .filter((waypoint) => waypoint.type === 'spot' && waypoint.spot_id)
    .map((waypoint) => ({
      spot_id: waypoint.spot_id,
      spot_name: waypoint.spot_name,
      spot_lat: waypoint.spot_lat,
      spot_lng: waypoint.spot_lng,
    }));

  if (spots.length < 2) {
    throw new Error('후기를 만들 산책 경로의 스팟이 부족합니다.');
  }

  const walkRecordId = await createCompletedWalk(api, course.course_id, spots);
  await createCourseReview(api, course.course_id, walkRecordId);
  await createSpotReviews(api, spots, walkRecordId);
}

async function main() {
  requireEnv();

  const courseApi = createApi(COURSE_USER_ID);
  const reviewApi = createApi(REVIEW_USER_ID);

  await courseApi.get('/health');

  if (MODE === 'reviews-only') {
    await createPrewalkReviews(reviewApi);
    return;
  }

  await createPrewalkCourse(courseApi);

  if (MODE === 'with-reviews') {
    await createPrewalkReviews(reviewApi);
  }
}

main().catch((err) => {
  const responseData = err.response?.data;
  console.error(responseData || err.message);
  process.exit(1);
});
