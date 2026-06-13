require('dotenv').config();

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE_URL = process.env.SEED_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const KAKAO_LOCAL_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const API_TIMEOUT_MS = Number(process.env.SEED_API_TIMEOUT_MS || 180000);
const COURSE_USER_ID =
  process.env.PREWALK_COURSE_USER_ID || process.env.PREWALK_USER_ID || '00000000-0000-4000-8000-000000000002';
const REVIEW_USER_ID =
  process.env.PREWALK_REVIEW_USER_ID || '00000000-0000-4000-8000-000000000003';
const SECOND_REVIEW_USER_ID =
  process.env.PREWALK_SECOND_REVIEW_USER_ID || '00000000-0000-4000-8000-000000000004';
const ADMIN_USER_ID =
  process.env.PREWALK_ADMIN_USER_ID || '00000000-0000-4000-8000-000000000001';
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

const TAG_IDS = {
  spot: {
    restroom: '10000000-0000-4000-8000-000000000003',
    cafeRestaurant: '10000000-0000-4000-8000-000000000006',
    bench: '10000000-0000-4000-8000-000000000007',
    parking: '10000000-0000-4000-8000-000000000009',
    photo: '10000000-0000-4000-8000-000000000010',
    nightView: '10000000-0000-4000-8000-000000000011',
    nightOpen: '10000000-0000-4000-8000-000000000015',
    history: '10000000-0000-4000-8000-000000000018',
    tour: '10000000-0000-4000-8000-000000000019',
    cultureArt: '10000000-0000-4000-8000-000000000027',
  },
  course: {
    recommended: '10000000-0000-4000-8000-000000000020',
    stroller: '10000000-0000-4000-8000-000000000022',
    pet: '10000000-0000-4000-8000-000000000024',
    child: '10000000-0000-4000-8000-000000000025',
    healing: '10000000-0000-4000-8000-000000000026',
  },
};

const PREWALK_DEMO_USERS = [COURSE_USER_ID, REVIEW_USER_ID, SECOND_REVIEW_USER_ID, ADMIN_USER_ID];

const REVIEW_ACTIVITIES = [
  {
    userId: REVIEW_USER_ID,
    courseReview: {
      ...COURSE_REVIEW,
      tag_ids: [TAG_IDS.course.recommended, TAG_IDS.course.healing],
    },
    spotReviews: {
      노원불빛정원: {
        ...SPOT_REVIEWS['노원불빛정원'],
        tag_ids: [TAG_IDS.spot.nightView, TAG_IDS.spot.photo, TAG_IDS.spot.nightOpen],
      },
      화랑대철도공원: {
        ...SPOT_REVIEWS['화랑대 철도 공원'],
        tag_ids: [TAG_IDS.spot.bench, TAG_IDS.spot.photo],
      },
      화랑대역사전시관: {
        ...SPOT_REVIEWS['화랑대 역사 전시관'],
        tag_ids: [TAG_IDS.spot.history, TAG_IDS.spot.cultureArt],
      },
      테르미니: {
        ...SPOT_REVIEWS['테르미니 서울여대점'],
        tag_ids: [TAG_IDS.spot.cafeRestaurant, TAG_IDS.spot.parking],
      },
    },
  },
  {
    userId: SECOND_REVIEW_USER_ID,
    courseReview: {
      description: '퇴근 후에 따라 걸어봤는데 동선이 짧고 역 주변 분위기도 좋아서 부담 없었어요. 밥집으로 마무리되는 점이 특히 편했습니다.',
      difficulty: 'easy',
      rating: 4.0,
      is_public: true,
      tag_ids: [TAG_IDS.course.healing, TAG_IDS.course.stroller],
    },
    spotReviews: {
      노원불빛정원: {
        description: '조명이 켜진 뒤에 가야 확실히 예뻐요. 사진 찍는 사람이 많아서 조금 붐빌 수는 있습니다.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.nightView, TAG_IDS.spot.photo],
      },
      화랑대철도공원: {
        description: '폐철로 분위기와 전시된 기차가 잘 어울려서 산책하는 재미가 있었어요.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.bench, TAG_IDS.spot.tour],
      },
      화랑대역사전시관: {
        description: '전시관 자체는 작아서 오래 머물 곳은 아니지만, 철도공원과 같이 보면 코스 흐름이 자연스러웠습니다.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.history, TAG_IDS.spot.tour],
      },
      테르미니: {
        description: '걷고 나서 식사하기 괜찮았어요. 서울여대 근처 약속 장소로 잡기 편했습니다.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.cafeRestaurant, TAG_IDS.spot.parking],
      },
      카페기차가있는풍경: {
        description: '산책 중간에 잠깐 쉬어가기 좋은 카페였어요. 철도공원 분위기랑 잘 맞아서 코스에 추가하기 좋았습니다.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.cafeRestaurant, TAG_IDS.spot.photo],
      },
      경춘선숲길갤러리: {
        description: '걷다가 가볍게 들르기 좋은 공간이었어요. 조용히 둘러보기 좋아서 중간 스팟으로 괜찮았습니다.',
        is_recommended: true,
        is_public: true,
        tag_ids: [TAG_IDS.spot.cultureArt, TAG_IDS.spot.bench],
      },
    },
  },
];

let dbPool;

function getPool() {
  if (!dbPool) {
    // seed 시연 데이터처럼 API가 아직 없는 테이블은 앱과 같은 DB 설정을 직접 사용합니다.
    dbPool = require('../config/db');
  }
  return dbPool;
}

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
    timeout: API_TIMEOUT_MS,
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

function pickMatchingSpot(spots, expectedName) {
  const expected = normalizeName(expectedName);
  return (
    spots.find((spot) => normalizeName(spot.name) === expected) ||
    spots.find((spot) => normalizeName(spot.name).includes(expected)) ||
    spots.find((spot) => expected.includes(normalizeName(spot.name))) ||
    null
  );
}

function getFallbackCategory(categoryName = '') {
  const parts = categoryName.split('>').map((part) => part.trim()).filter(Boolean);
  return parts[2] || parts[1] || '기타';
}

function mapKakaoDocumentToSpot(document) {
  return {
    kakao_place_id: document.id,
    name: document.place_name,
    kakao_category_name: document.category_name,
    categories: [getFallbackCategory(document.category_name)],
    address: document.road_address_name || document.address_name || null,
    x: document.x,
    y: document.y,
    is_saved: false,
    has_app_data: false,
  };
}

function pickReviewForSpot(spot) {
  const normalizedSpotName = normalizeName(spot.spot_name || spot.name);
  const matchedLabel = Object.keys(SPOT_REVIEWS).find((label) => {
    const normalizedLabel = normalizeName(label);
    return normalizedSpotName.includes(normalizedLabel) || normalizedLabel.includes(normalizedSpotName);
  });

  return matchedLabel ? SPOT_REVIEWS[matchedLabel] : null;
}

function pickReviewFromMap(spot, reviewMap) {
  const normalizedSpotName = normalizeName(spot.spot_name || spot.name || spot.label);
  const matchedLabel = Object.keys(reviewMap).find((label) => {
    const normalizedLabel = normalizeName(label);
    return normalizedSpotName.includes(normalizedLabel) || normalizedLabel.includes(normalizedSpotName);
  });

  return matchedLabel ? reviewMap[matchedLabel] : null;
}

async function searchSpot(api, spotPlan) {
  const { data } = await api.get('/api/spots/search', {
    params: { keyword: spotPlan.query },
  });

  const spots = data.spots || [];
  if (spots.length > 0) {
    const picked = pickMatchingSpot(spots, spotPlan.expectedName);
    if (picked) return picked;
  }

  const kakaoResponse = await axios.get(KAKAO_LOCAL_SEARCH_URL, {
    params: { query: spotPlan.query, size: 5, page: 1 },
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
  });
  const kakaoDocuments = kakaoResponse.data.documents || [];
  if (kakaoDocuments.length === 0) {
    throw new Error(`${spotPlan.label} 카카오 검색 결과가 없습니다.`);
  }

  const pickedDocument = pickBestSpot(
    kakaoDocuments.map(mapKakaoDocumentToSpot),
    spotPlan.expectedName
  );
  if (!pickedDocument) {
    throw new Error(`${spotPlan.label} 카카오 검색 결과를 선택하지 못했습니다.`);
  }

  return pickedDocument;
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

async function getCourseRouteGpsPoints(courseId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ST_AsGeoJSON(route_geometry::geometry)::json AS route
     FROM courses
     WHERE course_id = $1`,
    [courseId]
  );
  const coordinates = rows[0]?.route?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  return coordinates.map(([lng, lat]) => ({
    lat: Number(lat),
    lng: Number(lng),
  }));
}

async function createCompletedWalk(api, courseId, spots) {
  const startResponse = await api.post('/api/walks', { course_id: courseId });
  const walkRecordId = startResponse.data.walk_record_id;
  const gpsPoints = (await getCourseRouteGpsPoints(courseId)) || buildGpsPoints(spots);

  const endResponse = await api.patch(`/api/walks/${walkRecordId}/end`, {
    gps_points: gpsPoints,
  });

  console.log('completed walk:', endResponse.data);
  return walkRecordId;
}

async function createCourseReview(api, courseId, walkRecordId, review = COURSE_REVIEW) {
  const response = await api.post(`/api/courses/${courseId}/reviews`, {
    walk_record_id: walkRecordId,
    ...review,
  });

  console.log('created course review:', response.data);
  return response.data;
}

async function createSpotReviews(api, spots, walkRecordId, reviewMap = SPOT_REVIEWS) {
  const reviews = [];
  for (const spot of spots) {
    const review = pickReviewFromMap(spot, reviewMap) || (spot.label ? SPOT_REVIEWS[spot.label] : pickReviewForSpot(spot));
    if (!review) continue;

    const response = await api.post(`/api/spots/${spot.spot_id}/reviews`, {
      walk_record_id: walkRecordId,
      ...review,
    });

    console.log(`created spot review: ${spot.spot_name || spot.name || spot.label}`, response.data);
    reviews.push({
      ...response.data,
      spot_name: spot.spot_name || spot.name || spot.label,
    });
  }
  return reviews;
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

async function getExtraWalkSpotsFromDb() {
  const pool = getPool();
  const expectedNames = EXTRA_WALK_SPOTS.map((spot) => spot.expectedName);
  const { rows } = await pool.query(
    `SELECT spot_id, name AS spot_name,
            ST_Y(location::geometry) AS spot_lat,
            ST_X(location::geometry) AS spot_lng
     FROM spots
     WHERE name = ANY($1::text[]) AND status = 'active'
     ORDER BY name`,
    [expectedNames]
  );
  return rows;
}

async function cleanupPrewalkEngagements(courseId, spotIds) {
  const pool = getPool();
  const client = await pool.connect();
  const demoUsers = PREWALK_DEMO_USERS;

  try {
    await client.query('BEGIN');

    const { rows: reviewRows } = await client.query(
      `SELECT course_review_id AS review_id, 'course_review' AS review_type
       FROM course_reviews
       WHERE course_id = $1 AND user_id = ANY($2::uuid[])
       UNION ALL
       SELECT spot_review_id AS review_id, 'spot_review' AS review_type
       FROM spot_reviews
       WHERE spot_id = ANY($3::uuid[]) AND user_id = ANY($2::uuid[])`,
      [courseId, demoUsers, spotIds]
    );

    const courseReviewIds = reviewRows
      .filter((row) => row.review_type === 'course_review')
      .map((row) => row.review_id);
    const spotReviewIds = reviewRows
      .filter((row) => row.review_type === 'spot_review')
      .map((row) => row.review_id);
    const allReviewIds = reviewRows.map((row) => row.review_id);

    await client.query(
      `DELETE FROM notifications
       WHERE message LIKE '[서울여대 시연]%'`
    );

    await client.query(
      `DELETE FROM reports
       WHERE reporter_id = ANY($1::uuid[])
         AND (
           target_id = $2
           OR target_id = ANY($3::uuid[])
           OR target_id = ANY($4::uuid[])
           OR memo LIKE '[서울여대 시연]%'
         )`,
      [demoUsers, courseId, spotIds, allReviewIds]
    );

    await client.query(
      `DELETE FROM reactions
       WHERE (target_type = 'course_review' AND target_id = ANY($1::uuid[]))
          OR (target_type = 'spot_review' AND target_id = ANY($2::uuid[]))`,
      [courseReviewIds, spotReviewIds]
    );

    await client.query(
      `DELETE FROM spot_reviews
       WHERE spot_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])`,
      [spotIds, demoUsers]
    );

    await client.query(
      `DELETE FROM course_reviews
       WHERE course_id = $1 AND user_id = ANY($2::uuid[])`,
      [courseId, demoUsers]
    );

    await client.query(
      `DELETE FROM walk_records
       WHERE course_id = $1 AND user_id = ANY($2::uuid[])`,
      [courseId, demoUsers]
    );

    await client.query(
      `DELETE FROM bookmarks
       WHERE user_id = ANY($1::uuid[])
         AND (
           (target_type = 'course' AND target_id = $2)
           OR (target_type = 'spot' AND target_id = ANY($3::uuid[]))
         )`,
      [demoUsers, courseId, spotIds]
    );

    await client.query(
      `DELETE FROM taggings
       WHERE user_id = ANY($1::uuid[])
         AND (
           (target_type = 'course' AND target_id = $2)
           OR (target_type = 'spot' AND target_id = ANY($3::uuid[]))
         )`,
      [demoUsers, courseId, spotIds]
    );

    await client.query('COMMIT');
    console.log('cleaned prewalk demo engagement data');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createBookmark(userId, targetId, targetType) {
  const pool = getPool();
  const { rows: [bookmark] } = await pool.query(
    `INSERT INTO bookmarks (user_id, target_id, target_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, target_id, target_type) DO UPDATE
       SET created_at = bookmarks.created_at
     RETURNING bookmark_id, user_id, target_id, target_type`,
    [userId, targetId, targetType]
  );
  return bookmark;
}

async function createBookmarks(courseId, spots) {
  const bookmarks = [];
  bookmarks.push(await createBookmark(REVIEW_USER_ID, courseId, 'course'));
  bookmarks.push(await createBookmark(SECOND_REVIEW_USER_ID, courseId, 'course'));

  const bookmarkTargets = spots.filter((spot) =>
    ['노원불빛정원', '테르미니', '카페기차가있는풍경', '경춘선숲길갤러리']
      .some((name) => normalizeName(spot.spot_name || spot.name) === normalizeName(name))
  );

  for (const spot of bookmarkTargets) {
    bookmarks.push(await createBookmark(REVIEW_USER_ID, spot.spot_id, 'spot'));
  }

  console.log('created bookmarks:', bookmarks.map((bookmark) => ({
    target_type: bookmark.target_type,
    target_id: bookmark.target_id,
  })));
}

async function createReaction(api, targetId, targetType, reaction) {
  const { data } = await api.post('/api/reactions', {
    target_id: targetId,
    target_type: targetType,
    reaction,
  });
  console.log('created reaction:', data);
}

async function createReviewReactions(createdReviews) {
  const ownerApi = createApi(COURSE_USER_ID);
  const adminApi = createApi(ADMIN_USER_ID);
  const secondApi = createApi(SECOND_REVIEW_USER_ID);

  const firstCourseReview = createdReviews.courseReviews[0];
  const secondCourseReview = createdReviews.courseReviews[1];
  const firstSpotReview = createdReviews.spotReviews[0];
  const historySpotReview = createdReviews.spotReviews.find((review) =>
    normalizeName(review.spot_name).includes(normalizeName('화랑대역사전시관'))
  ) || createdReviews.spotReviews[2];

  if (firstCourseReview) {
    await createReaction(ownerApi, firstCourseReview.course_review_id, 'course_review', 'like');
    await createReaction(secondApi, firstCourseReview.course_review_id, 'course_review', 'like');
  }

  if (secondCourseReview) {
    await createReaction(adminApi, secondCourseReview.course_review_id, 'course_review', 'like');
  }

  if (firstSpotReview) {
    await createReaction(ownerApi, firstSpotReview.spot_review_id, 'spot_review', 'like');
  }

  if (historySpotReview) {
    await createReaction(adminApi, historySpotReview.spot_review_id, 'spot_review', 'dislike');
  }
}

async function createReportsAndNotifications(courseId, spots, createdReviews) {
  const pool = getPool();
  const historySpot = spots.find((spot) => normalizeName(spot.spot_name || spot.name).includes(normalizeName('화랑대역사전시관')));
  const firstCourseReview = createdReviews.courseReviews[0];

  const reports = [];
  const courseReport = await pool.query(
    `INSERT INTO reports (
       reporter_id, target_id, target_type, report_category,
       reason, memo, location, photo_url, status
     )
     VALUES ($1, $2, 'course', 'environment', 'info_error',
             '[서울여대 시연] 코스 설명에 운영 시간 안내가 더 있으면 좋겠습니다.',
             NULL, NULL, 'completed')
     ON CONFLICT (reporter_id, target_id, target_type) DO UPDATE SET
       report_category = EXCLUDED.report_category,
       reason = EXCLUDED.reason,
       memo = EXCLUDED.memo,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING report_id`,
    [SECOND_REVIEW_USER_ID, courseId]
  );
  reports.push(courseReport.rows[0]);

  if (historySpot) {
    const spotReport = await pool.query(
      `INSERT INTO reports (
         reporter_id, target_id, target_type, report_category,
         reason, memo, location, photo_url, status
       )
       VALUES ($1, $2, 'spot', 'environment', 'etc',
               '[서울여대 시연] 전시관 휴관일 정보 확인이 필요합니다.',
               NULL, NULL, 'in_progress')
       ON CONFLICT (reporter_id, target_id, target_type) DO UPDATE SET
         report_category = EXCLUDED.report_category,
         reason = EXCLUDED.reason,
         memo = EXCLUDED.memo,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING report_id`,
      [REVIEW_USER_ID, historySpot.spot_id]
    );
    reports.push(spotReport.rows[0]);
  }

  if (firstCourseReview) {
    const reviewReport = await pool.query(
      `INSERT INTO reports (
         reporter_id, target_id, target_type, report_category,
         reason, memo, location, photo_url, status
       )
       VALUES ($1, $2, 'course_review', 'user', 'false_info',
               '[서울여대 시연] 후기 내용 검토용 신고 예시입니다.',
               NULL, NULL, 'rejected')
       ON CONFLICT (reporter_id, target_id, target_type) DO UPDATE SET
         report_category = EXCLUDED.report_category,
         reason = EXCLUDED.reason,
         memo = EXCLUDED.memo,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING report_id`,
      [ADMIN_USER_ID, firstCourseReview.course_review_id]
    );
    reports.push(reviewReport.rows[0]);
  }

  for (const report of reports) {
    await pool.query(
      `INSERT INTO notifications (user_id, target_id, target_type, message, is_read)
       VALUES ($1, $2, 'report', $3, FALSE)`,
      [
        SECOND_REVIEW_USER_ID,
        report.report_id,
        '[서울여대 시연] 신고 처리 상태가 업데이트되었습니다.',
      ]
    );
  }

  console.log('created reports and notifications:', reports.map((report) => report.report_id));
}

async function printPrewalkEngagementSummary(courseId, spotIds) {
  const pool = getPool();
  const { rows: [summary] } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM walk_records WHERE course_id = $1) AS walk_records,
       (SELECT COUNT(*)::int FROM course_reviews WHERE course_id = $1 AND status = 'active') AS course_reviews,
       (SELECT COUNT(*)::int FROM spot_reviews WHERE spot_id = ANY($2::uuid[]) AND status = 'active') AS spot_reviews,
       (SELECT COUNT(*)::int FROM bookmarks WHERE target_id = $1 OR target_id = ANY($2::uuid[])) AS bookmarks,
       (SELECT COUNT(*)::int
        FROM reactions
        WHERE target_id IN (
          SELECT course_review_id FROM course_reviews WHERE course_id = $1
          UNION
          SELECT spot_review_id FROM spot_reviews WHERE spot_id = ANY($2::uuid[])
        )) AS reactions,
       (SELECT COUNT(*)::int
        FROM reports
        WHERE memo LIKE '[서울여대 시연]%'
           OR target_id = $1
           OR target_id = ANY($2::uuid[])) AS reports,
       (SELECT COUNT(*)::int
        FROM notifications
        WHERE message LIKE '[서울여대 시연]%') AS notifications`,
    [courseId, spotIds]
  );
  console.log('prewalk engagement summary:', summary);
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

  const extraSpots = await getExtraWalkSpotsFromDb();
  const reviewableSpots = [...spots, ...extraSpots];
  const allSpotIds = reviewableSpots.map((spot) => spot.spot_id);

  await cleanupPrewalkEngagements(course.course_id, allSpotIds);

  const createdReviews = {
    courseReviews: [],
    spotReviews: [],
  };

  for (const activity of REVIEW_ACTIVITIES) {
    const activityApi = createApi(activity.userId);
    const walkRecordId = await createCompletedWalk(activityApi, course.course_id, spots);

    const courseReview = await createCourseReview(
      activityApi,
      course.course_id,
      walkRecordId,
      activity.courseReview
    );
    createdReviews.courseReviews.push(courseReview);

    const spotReviews = await createSpotReviews(
      activityApi,
      reviewableSpots,
      walkRecordId,
      activity.spotReviews
    );
    createdReviews.spotReviews.push(...spotReviews);
  }

  await createBookmarks(course.course_id, reviewableSpots);
  await createReviewReactions(createdReviews);
  await createReportsAndNotifications(course.course_id, reviewableSpots, createdReviews);
  await printPrewalkEngagementSummary(course.course_id, allSpotIds);
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

main()
  .catch((err) => {
    const responseData = err.response?.data;
    console.error(responseData || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dbPool) {
      await dbPool.end();
    }
  });
