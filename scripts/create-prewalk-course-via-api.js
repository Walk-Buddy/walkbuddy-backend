require('dotenv').config();

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE_URL = process.env.SEED_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const USER_ID = process.env.PREWALK_USER_ID || '00000000-0000-4000-8000-000000000002';
const USER_ROLE = process.env.PREWALK_USER_ROLE || 'user';

const COURSE_NAME = '노원불빛정원-화랑대 철도공원 산책';

const PLAN_SPOTS = [
  { label: '노원불빛정원', query: '노원불빛정원', expectedName: '노원불빛정원' },
  { label: '화랑대 철도 공원', query: '화랑대 철도공원', expectedName: '화랑대철도공원' },
  { label: '화랑대 역사 전시관', query: '화랑대 역사전시관', expectedName: '화랑대역사전시관' },
  { label: '테르미니', query: '테르미니 공릉', expectedName: '테르미니' },
];

function requireEnv() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET이 .env에 없습니다.');
  }
}

function createAccessToken() {
  return jwt.sign(
    { user_id: USER_ID, role: USER_ROLE },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
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

async function main() {
  requireEnv();

  const token = createAccessToken();
  const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  await api.get('/health');

  const savedSpots = [];
  for (const spotPlan of PLAN_SPOTS) {
    const candidate = await searchSpot(api, spotPlan);
    const savedSpot = await saveSpotIfNeeded(api, candidate);
    savedSpots.push(savedSpot);
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
    description: '사용자가 실제 산책 전에 노원불빛정원에서 테르미니까지 스팟을 순서대로 선택해 계획한 코스입니다.',
    category: '도심산책',
    is_public: true,
    waypoints,
  });

  console.log('created course:', courseResponse.data);
}

main().catch((err) => {
  const responseData = err.response?.data;
  console.error(responseData || err.message);
  process.exit(1);
});
