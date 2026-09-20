// ============================================================
// 시연용 Engagement 데이터 생성 스크립트 (하이브리드)
// ------------------------------------------------------------
// - users          : DB 직접 INSERT (bcrypt, 비밀번호 gilbom123!)
// - walk_records   : 실제 API (POST /api/walks → PATCH /api/walks/:id/end)
// - course_reviews : 실제 API (POST /api/courses/:id/reviews, tag_ids 동봉)
// - spot_reviews   : 실제 API (POST /api/spots/:id/reviews) + 사진은 DB UPDATE(절대 URL)
// - reactions      : 실제 API (POST /api/reactions)
// - bookmarks      : 실제 API (POST /api/bookmarks)
// - reports        : DB 직접 INSERT (reports.location 컬럼 없음 주의)
// - notifications  : DB 직접 INSERT
// - spot_ai_contents: aiContentService.getAiContentsByTypes(spotId, ['tour']) 재사용
// - spots.first_image: 별도 backfill (npm run seed:first-image) 로 채움
//
// 지역: 춘천 반 / 서울(종로·강서·강북) 반   (노원구 데이터 없음 → 서울로 대체)
//
// 사용법:
//   node scripts/seed-demo-engagements.js            # 생성 (멱등)
//   node scripts/seed-demo-engagements.js --reset    # 기존 [시연] 데이터 삭제 후 재생성
//   node scripts/seed-demo-engagements.js --with-ai  # AI 음성 콘텐츠(tour)도 생성
// ============================================================
require('dotenv').config();

const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const API_BASE_URL =
  process.env.SEED_API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const API_TIMEOUT_MS = Number(process.env.SEED_API_TIMEOUT_MS || 180000);
const WITH_AI = process.argv.includes('--with-ai');
const RESET = process.argv.includes('--reset');
const DEMO_TAG = '[시연]';

// ── 관리자(두루누비) 계정: contest DB의 기존 admin ───────────────
const ADMIN_USER_ID = '0e9b6b2c-0ae7-470a-a15c-69e37fede66d';

// ── 시연 일반 사용자 (일반 로그인, 비밀번호 gilbom123!) ──────────
const DEMO_PASSWORD = 'gilbom123!';
const DEMO_USERS = [
  { key: 'sangji', userId: '10000000-0000-4000-8000-000000000011', email: 'sangji@gilbom.com', nickname: '상지' },
  { key: 'yuna',   userId: '10000000-0000-4000-8000-000000000012', email: 'yuna@gilbom.com',   nickname: '윤아' },
  { key: 'subin',  userId: '10000000-0000-4000-8000-000000000013', email: 'subin@gilbom.com',  nickname: '수빈' },
  { key: 'yujeong',userId: '10000000-0000-4000-8000-000000000014', email: 'yujeong@gilbom.com',nickname: '유정' },
  { key: 'tester', userId: '10000000-0000-4000-8000-000000000015', email: 'tester@gilbom.com', nickname: '테스터' },
];
const USER = Object.fromEntries(DEMO_USERS.map((u) => [u.key, u.userId]));

// ── 시연 대상 지역 태그 ────────────────────────────────────────
const REGION = {
  chuncheon: ['춘천'],
  seoul: ['서울'],
};

// ── 시연 대상 코스명 (contest DB 실존 확인분) ───────────────────
// 춘천 5개 + 서울 5개 = 총 10개 코스에 후기/기록 등을 분산
const TARGET_COURSE_NAMES = [
  // 춘천
  '실레이야기길(봄내길 1-1코스)',
  '의암호나들길(봄내길 4코스)',
  '소양강변길(봄내길 4-1코스)',
  '물깨말구구리길(봄내길 2코스)',
  '장학리노루목길(봄내길 6코스)',
  // 서울
  '역사힐링길',
  '강서둘레길(봉제산코스)',
  '봉제산 무장애숲길',
  '개화산 자락길',
  '한강변 명품숲 둘레길(개통예정구간포함)',
];

// ── 코스 후기 템플릿 (난이도/평점/문구/태그) ─────────────────────
// 태그 이름은 tags.name 기준 (type='course', is_review_tag=TRUE)
const COURSE_REVIEW_TEMPLATES = [
  { difficulty: 'easy',   rating: 4.5, tagNames: ['힐링', '자연·풍경'], text: '길이 완만하고 정비가 잘 돼 있어서 가볍게 걷기 좋았어요. 주말 아침 산책으로 추천합니다.' },
  { difficulty: 'normal', rating: 4.0, tagNames: ['자연·풍경', '역사·문화'], text: '볼거리가 중간중간 있어서 지루하지 않았어요. 사진 찍을 곳도 많고 코스 설명도 잘 맞았습니다.' },
  { difficulty: 'easy',   rating: 5.0, tagNames: ['힐링', '노을·야경'], text: '해질 무렵에 걸었는데 분위기가 정말 좋았어요. 다음에 또 오고 싶은 코스입니다.' },
  { difficulty: 'normal', rating: 3.5, tagNames: ['아이와함께'], text: '아이랑 같이 걸었는데 무난했어요. 다만 일부 구간은 안내 표지가 조금 아쉬웠습니다.' },
  { difficulty: 'hard',   rating: 4.5, tagNames: ['자연·풍경'], text: '오르막이 제법 있어서 운동이 확실히 됐어요. 전망 좋은 지점에서 쉬어가면 좋습니다.' },
  { difficulty: 'easy',   rating: 4.0, tagNames: ['힐링', '반려동물'], text: '강아지랑 같이 걸었는데 데크길이 많아서 발도 편했어요. 반려견 동반 산책으로 추천!' },
];

// ── 스팟 후기 템플릿 ────────────────────────────────────────────
const SPOT_REVIEW_TEMPLATES = [
  { is_recommended: true,  tagNames: ['포토존', '야경명소'],   text: '사진 찍기 정말 좋은 곳이에요. 저녁에 조명 켜지면 분위기가 최고입니다.' },
  { is_recommended: true,  tagNames: ['벤치·쉼터'],            text: '쉴 곳이 잘 마련돼 있어서 잠깐 앉아 쉬기 좋았어요. 경치도 좋습니다.' },
  { is_recommended: true,  tagNames: ['카페&식당'],            text: '주변에 카페가 있어서 산책 후 커피 한 잔 하기 딱 좋았어요.' },
  { is_recommended: true,  tagNames: ['역사유적', '문화/예술'],text: '역사적인 장소라 그냥 지나치기 아까웠어요. 천천히 둘러보길 추천합니다.' },
  { is_recommended: false, tagNames: ['벤치·쉼터'],            text: '사람이 많아서 붐비는 편이에요. 한적한 시간대를 노리는 걸 추천합니다.' },
  { is_recommended: true,  tagNames: ['주차가능'],             text: '주차 공간이 있어서 접근이 편했어요. 가족 나들이로도 괜찮습니다.' },
];

// ── 후기 사진으로 쓸 안정적인 공개 이미지 URL (화면 노출용) ──────
// 관광공사·카카오 CDN 등 https 절대 URL. 비어 있으면 사진 없이 생성.
const REVIEW_PHOTO_POOL = [
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800',
  'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800',
  'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
];

let dbPool = pool;

// ============================================================
// 유틸
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireEnv() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET이 .env에 없습니다.');
}

function createAccessToken(userId, role = 'user') {
  return jwt.sign({ user_id: userId, role }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

function createApi(userId, role = 'user') {
  return axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${createAccessToken(userId, role)}`,
      'Content-Type': 'application/json',
    },
  });
}

const pick = (arr, i) => arr[i % arr.length];

// ============================================================
// 1. 사용자 생성 (DB 직접)
// ============================================================
async function ensureUsers() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let ensured = 0;

  for (const u of DEMO_USERS) {
    // 1) 이메일로 이미 존재하는 계정이 있으면 그 계정을 데모 계정으로 갱신
    const byEmail = await dbPool.query(
      `SELECT user_id FROM users WHERE email = $1 LIMIT 1`,
      [u.email]
    );

    if (byEmail.rows.length) {
      await dbPool.query(
        `UPDATE users SET
           password_hash = $1, nickname = $2, role = 'user', status = 'active',
           social_provider = NULL, social_id = NULL, updated_at = NOW()
         WHERE user_id = $3`,
        [hash, u.nickname, byEmail.rows[0].user_id]
      );
      ensured += 1;
      continue;
    }

    // 2) 닉네임만 점유된 기존 계정(예: 카카오 '윤아')이 있으면 그 행을 데모 계정으로 전환
    const byNick = await dbPool.query(
      `SELECT user_id FROM users WHERE nickname = $1 LIMIT 1`,
      [u.nickname]
    );

    if (byNick.rows.length) {
      await dbPool.query(
        `UPDATE users SET
           email = $1, password_hash = $2, nickname = $3, role = 'user', status = 'active',
           social_provider = NULL, social_id = NULL, updated_at = NOW()
         WHERE user_id = $4`,
        [u.email, hash, u.nickname, byNick.rows[0].user_id]
      );
      console.log(`  · 기존 '${u.nickname}' 계정을 데모 계정으로 전환 (${byNick.rows[0].user_id})`);
      ensured += 1;
      continue;
    }

    // 3) 신규 생성
    await dbPool.query(
      `INSERT INTO users (user_id, email, password_hash, nickname, role, status, social_provider)
       VALUES ($1, $2, $3, $4, 'user', 'active', NULL)`,
      [u.userId, u.email, hash, u.nickname]
    );
    ensured += 1;
  }
  console.log(`[users] ${ensured}/${DEMO_USERS.length}명 보장 완료 (비밀번호: ${DEMO_PASSWORD})`);
}

// ============================================================
// 2. 대상 코스/스팟 로딩 (contest DB 실데이터)
// ============================================================
async function loadTargetCourses() {
  const { rows } = await dbPool.query(
    `SELECT c.course_id, c.name, c.region, c.total_distance, c.estimated_duration
     FROM courses c
     WHERE c.name = ANY($1::text[]) AND c.status = 'active'`,
    [TARGET_COURSE_NAMES]
  );
  if (!rows.length) throw new Error('시연 대상 코스를 찾지 못했습니다.');
  console.log(`[courses] 대상 코스 ${rows.length}개 확보:`, rows.map((r) => r.name).join(', '));
  return rows;
}

async function loadCourseWaypoints(courseId) {
  const { rows } = await dbPool.query(
    `SELECT DISTINCT ON (w.spot_id) w.spot_id, s.name AS spot_name, w.seq
     FROM course_waypoints w
     JOIN spots s ON s.spot_id = w.spot_id
     WHERE w.course_id = $1 AND w.type = 'spot' AND s.status = 'active'
     ORDER BY w.spot_id, w.seq`,
    [courseId]
  );
  // seq 기준 재정렬 (DISTINCT ON 은 spot_id 정렬을 강제하므로 별도 정렬)
  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

// ============================================================
// 3. 태그 조회 (이름 → tag_id)
// ============================================================
async function loadTagMap(type) {
  const { rows } = await dbPool.query(
    `SELECT tag_id, name FROM tags
     WHERE type = $1 AND is_active = TRUE AND is_review_tag = TRUE`,
    [type]
  );
  const map = {};
  for (const r of rows) map[r.name] = r.tag_id;
  return map;
}

// ensureUsers 실행 후 실제 user_id 로 USER 매핑을 갱신한다.
// (닉네임 점유 계정 전환 시 고정 UUID 와 실제 UUID 가 달라질 수 있음)
async function refreshUserIds() {
  for (const u of DEMO_USERS) {
    const { rows } = await dbPool.query(
      `SELECT user_id FROM users WHERE email = $1 LIMIT 1`,
      [u.email]
    );
    if (rows.length) USER[u.key] = rows[0].user_id;
  }
}

function resolveTagIds(tagMap, names = []) {
  return names.map((n) => tagMap[n]).filter(Boolean);
}

// ============================================================
// 4. 산책 기록 (API)
// ============================================================
async function createCompletedWalk(api, course) {
  const startRes = await api.post('/api/walks', { course_id: course.course_id });
  const walkRecordId = startRes.data.walk_record_id;

  // 거리/시간은 코스 정보 기준 ±15% 랜덤
  const baseDist = Number(course.total_distance) || 2000;
  const baseDur = Number(course.estimated_duration) || 40;
  const jitter = (v, p = 0.15) => Math.round(v * (1 + (Math.random() * 2 - 1) * p));

  await api.patch(`/api/walks/${walkRecordId}/end`, {
    total_distance: jitter(baseDist),
    duration: jitter(baseDur),
    is_completed: true,
    // GPS 궤적은 서버로 전송하지 않음 (온디바이스 처리) → map_image_url 도 보내지 않음
  });
  return walkRecordId;
}

// ============================================================
// 5. 코스 후기 (API)
// ============================================================
async function createCourseReview(api, courseId, walkRecordId, tpl, tagMap) {
  const body = {
    walk_record_id: walkRecordId,
    description: tpl.text,
    difficulty: tpl.difficulty,
    rating: tpl.rating,
    is_public: true,
    tag_ids: resolveTagIds(tagMap, tpl.tagNames),
  };
  const { data } = await api.post(`/api/courses/${courseId}/reviews`, body);
  return data;
}

// ============================================================
// 6. 스팟 후기 (API) + 사진 DB UPDATE
// ============================================================
async function createSpotReview(api, spotId, walkRecordId, tpl, tagMap, photoUrls) {
  const body = {
    walk_record_id: walkRecordId,
    description: tpl.text,
    is_recommended: tpl.is_recommended,
    is_public: true,
    tag_ids: resolveTagIds(tagMap, tpl.tagNames),
  };
  const { data } = await api.post(`/api/spots/${spotId}/reviews`, body);
  const spotReviewId = data.spot_review_id;
  if (spotReviewId && photoUrls.length) {
    // 리뷰 사진은 파일 업로드(multipart) 경로라 API로는 절대 URL 을 넣을 수 없음 → DB 로 직접 보정
    await dbPool.query(
      `UPDATE spot_reviews SET photos = $1 WHERE spot_review_id = $2`,
      [photoUrls, spotReviewId]
    );
  }
  return data;
}

// ============================================================
// 7. 반응 / 북마크 (API)
// ============================================================
async function addReaction(api, targetId, targetType, reaction) {
  try {
    await api.post('/api/reactions', { target_id: targetId, target_type: targetType, reaction });
    return true;
  } catch (e) {
    if (e.response?.status === 409) return false;
    throw e;
  }
}

async function addBookmark(api, targetId, targetType) {
  try {
    await api.post('/api/bookmarks', { target_id: targetId, target_type: targetType });
    return true;
  } catch (e) {
    if (e.response?.status === 409) return false;
    throw e;
  }
}

// ============================================================
// 8. reports / notifications (DB 직접)
// ============================================================
async function createReports(courseIds, spotIds) {
  const reports = [];
  const reporterId = USER.sangji;
  const reporter2 = USER.yuna;

  const items = [
    { reporter: reporterId, target: courseIds[0], type: 'course', category: 'environment', reason: 'info_error', memo: `${DEMO_TAG} 코스 설명에 소요 시간 안내가 더 있으면 좋겠습니다.`, status: 'received' },
    { reporter: reporter2, target: courseIds[1] || courseIds[0], type: 'course', category: 'environment', reason: 'etc', memo: `${DEMO_TAG} 일부 구간 안내 표지가 부족했습니다.`, status: 'in_progress' },
    { reporter: reporterId, target: spotIds[0], type: 'spot', category: 'environment', reason: 'etc', memo: `${DEMO_TAG} 스팟 운영 시간 정보 확인이 필요합니다.`, status: 'completed' },
    { reporter: reporter2, target: spotIds[1] || spotIds[0], type: 'spot', category: 'user', reason: 'false_info', memo: `${DEMO_TAG} 사진 정보가 실제와 조금 다릅니다.`, status: 'rejected' },
  ];

  for (const it of items) {
    const { rows } = await dbPool.query(
      `INSERT INTO reports
         (reporter_id, target_id, target_type, report_category, reason, memo, photo_url, status, admin_memo)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
       ON CONFLICT (reporter_id, target_id, target_type) DO UPDATE SET
         report_category = EXCLUDED.report_category,
         reason = EXCLUDED.reason,
         memo = EXCLUDED.memo,
         status = EXCLUDED.status,
         admin_memo = EXCLUDED.admin_memo,
         updated_at = NOW()
       RETURNING report_id, status`,
      [it.reporter, it.target, it.type, it.category, it.reason, it.memo, it.status,
       it.status === 'completed' ? '확인 후 반영했습니다.' : null]
    );
    reports.push({ ...rows[0], reporter: it.reporter });
  }

  // 각 신고에 대해 신고자에게 알림 발송
  for (const r of reports) {
    await dbPool.query(
      `INSERT INTO notifications (user_id, target_id, target_type, message, is_read)
       VALUES ($1, $2, 'report', $3, $4)`,
      [r.reporter, r.report_id, `${DEMO_TAG} 신고 처리 상태가 업데이트되었습니다. (${r.status})`, r.status === 'completed']
    );
  }
  console.log(`[reports] 신고 ${reports.length}건 + 알림 생성 완료`);
}

// ============================================================
// 9. AI 음성 콘텐츠 (tour) — 기존 서비스 재사용
// ============================================================
async function generateTourAiContents(spotIds) {
  let aiContentService;
  try {
    aiContentService = require('../services/aiContentService');
  } catch (e) {
    console.warn('[ai] aiContentService 로드 실패, AI 콘텐츠 생성 건너뜀:', e.message);
    return;
  }
  for (const spotId of spotIds) {
    try {
      const result = await aiContentService.getAiContentsByTypes(spotId, ['tour']);
      console.log(`[ai] tour 콘텐츠 생성: ${spotId} (${result.contents?.length || 0}건)`);
    } catch (e) {
      console.warn(`[ai] ${spotId} AI 생성 실패: ${e.message}`);
    }
  }
}

// ============================================================
// 10. 시연 데이터 삭제 ([시연] 접두어 / 데모 유저 기준)
// ============================================================
async function resetDemoData(courseIds, spotIds) {
  const client = await dbPool.connect();
  const demoUsers = DEMO_USERS.map((u) => u.userId);
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM notifications WHERE message LIKE $1`,
      [`${DEMO_TAG}%`]
    );

    await client.query(
      `DELETE FROM reports
       WHERE reporter_id = ANY($1::uuid[])
          OR memo LIKE $2`,
      [demoUsers, `${DEMO_TAG}%`]
    );

    await client.query(
      `DELETE FROM reactions
       WHERE target_id IN (
         SELECT course_review_id FROM course_reviews WHERE user_id = ANY($1::uuid[])
         UNION
         SELECT spot_review_id FROM spot_reviews WHERE user_id = ANY($1::uuid[])
       ) OR user_id = ANY($1::uuid[])`,
      [demoUsers]
    );

    await client.query(
      `DELETE FROM spot_reviews WHERE user_id = ANY($1::uuid[])`,
      [demoUsers]
    );
    await client.query(
      `DELETE FROM course_reviews WHERE user_id = ANY($1::uuid[])`,
      [demoUsers]
    );
    await client.query(
      `DELETE FROM walk_records WHERE user_id = ANY($1::uuid[])`,
      [demoUsers]
    );
    await client.query(
      `DELETE FROM bookmarks WHERE user_id = ANY($1::uuid[])`,
      [demoUsers]
    );
    await client.query(
      `DELETE FROM taggings WHERE user_id = ANY($1::uuid[])`,
      [demoUsers]
    );

    await client.query('COMMIT');
    console.log('[reset] 기존 시연 데이터 삭제 완료');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// 메인
// ============================================================
async function main() {
  requireEnv();

  // 서버 헬스체크
  await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
  console.log(`[init] 서버 확인: ${API_BASE_URL}`);

  await ensureUsers();
  await refreshUserIds();

  const courses = await loadTargetCourses();
  const courseIds = courses.map((c) => c.course_id);

  const courseTagMap = await loadTagMap('course');
  const spotTagMap = await loadTagMap('spot');

  // 각 코스의 경유지 스팟 로딩
  const courseSpots = {};
  for (const c of courses) {
    courseSpots[c.course_id] = await loadCourseWaypoints(c.course_id);
  }
  const allSpotIds = [...new Set(
    Object.values(courseSpots).flat().map((s) => s.spot_id)
  )];
  console.log(`[spots] 시연 대상 스팟 ${allSpotIds.length}개`);

  if (RESET) {
    await resetDemoData(courseIds, allSpotIds);
  }

  // ── 시나리오: 사용자별로 역할을 다르게 하여 풍부하게 ──────────
  // 1) 각 사용자에게 2개 코스씩 배정 → 산책 + 코스후기 + 경유지 스팟후기
  // 2) 반응/북마크는 서로 엮어서 생성
  const assignments = [
    { user: 'sangji',  courses: [0, 5] },  // 춘천1, 서울 첫
    { user: 'yuna',    courses: [1, 6] },
    { user: 'subin',   courses: [2, 7] },
    { user: 'yujeong', courses: [3, 8] },
    { user: 'tester',  courses: [4] },     // 테스트 계정: 약간의 활동만
  ];

  const createdCourseReviews = []; // { userKey, reviewId }
  const createdSpotReviews = [];   // { userKey, spotReviewId, spotId }

  for (const a of assignments) {
    const api = createApi(USER[a.user]);
    for (let k = 0; k < a.courses.length; k++) {
      const course = courses[a.courses[k]];
      if (!course) continue;

      console.log(`\n[${a.user}] 산책→코스후기: ${course.name}`);
      const walkRecordId = await createCompletedWalk(api, course);

      // 코스 후기
      const tpl = pick(COURSE_REVIEW_TEMPLATES, a.courses[k] + k);
      const cr = await createCourseReview(api, course.course_id, walkRecordId, tpl, courseTagMap);
      createdCourseReviews.push({ userKey: a.user, reviewId: cr.course_review_id, courseId: course.course_id });
      console.log(`  - 코스 후기 등록: ${cr.course_review_id}`);

      // 경유지 스팟 후기 (앞쪽 2~3개 스팟만, 스팟별 1회)
      const spots = courseSpots[course.course_id] || [];
      const take = Math.min(spots.length, a.user === 'tester' ? 1 : 3);
      for (let s = 0; s < take; s++) {
        const spot = spots[s];
        const stpl = pick(SPOT_REVIEW_TEMPLATES, a.courses[k] + s);
        const photoUrls = (s % 2 === 0)
          ? [pick(REVIEW_PHOTO_POOL, a.courses[k] + s)]
          : [];
        try {
          const sr = await createSpotReview(api, spot.spot_id, walkRecordId, stpl, spotTagMap, photoUrls);
          createdSpotReviews.push({ userKey: a.user, spotReviewId: sr.spot_review_id, spotId: spot.spot_id });
          console.log(`  - 스팟 후기: ${spot.spot_name || spot.spot_id}`);
        } catch (e) {
          console.warn(`  - 스팟 후기 실패(${spot.spot_name}):`, e.response?.data || e.message);
        }
      }
    }
  }

  // ── 반응 (좋아요/싫어요): 모든 데모 유저가 서로의 후기에 반응 ──
  console.log('\n[reactions] 후기 반응 생성');
  const reactionApis = ['sangji', 'yuna', 'subin', 'yujeong', 'tester'].map((k) => ({ key: k, api: createApi(USER[k]) }));
  let likeCount = 0, dislikeCount = 0;

  for (const cr of createdCourseReviews) {
    for (const r of reactionApis) {
      if (r.key === cr.userKey) continue; // 본인 후기 제외
      const isLike = Math.random() < 0.8;
      if (await addReaction(r.api, cr.reviewId, 'course_review', isLike ? 'like' : 'dislike')) {
        isLike ? likeCount++ : dislikeCount++;
        await sleep(30);
      }
    }
  }
  for (const sr of createdSpotReviews) {
    for (const r of reactionApis) {
      if (r.key === sr.userKey) continue;
      const isLike = Math.random() < 0.85;
      if (await addReaction(r.api, sr.spotReviewId, 'spot_review', isLike ? 'like' : 'dislike')) {
        isLike ? likeCount++ : dislikeCount++;
        await sleep(30);
      }
    }
  }
  console.log(`[reactions] 좋아요 ${likeCount} / 싫어요 ${dislikeCount}`);

  // ── 북마크: 각 유저가 다른 사람 코스/스팟 북마크 ──────────────
  console.log('\n[bookmarks] 북마크 생성');
  let bmCount = 0;
  for (const a of assignments) {
    const api = createApi(USER[a.user]);
    for (const idx of a.courses) {
      const c = courses[idx];
      if (c && await addBookmark(api, c.course_id, 'course')) bmCount++;
    }
    // 자기 코스 아닌 스팟 2개 북마크
    const otherSpots = allSpotIds.slice((a.courses[0] || 0), (a.courses[0] || 0) + 2);
    for (const sid of otherSpots) {
      if (await addBookmark(api, sid, 'spot')) bmCount++;
    }
  }
  console.log(`[bookmarks] ${bmCount}건`);

  // ── 신고/알림 ─────────────────────────────────────────────────
  await createReports(courseIds, allSpotIds);

  // ── AI 음성 콘텐츠 (선택) ─────────────────────────────────────
  if (WITH_AI) {
    console.log('\n[ai] tour 콘텐츠 생성 시작 (시간이 걸립니다)');
    await generateTourAiContents(allSpotIds.slice(0, 20));
  }

  // ── 요약 ──────────────────────────────────────────────────────
  await printSummary(courseIds, allSpotIds);

  console.log('\n[seed] 시연 데이터 생성 완료');
  console.log('[seed] 스팟 대표사진은 다음으로 채우세요: npm run seed:first-image');
}

async function printSummary(courseIds, spotIds) {
  const { rows: [s] } = await dbPool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE email LIKE '%@gilbom.com') AS demo_users,
       (SELECT COUNT(*)::int FROM walk_records WHERE user_id = ANY($1::uuid[])) AS walks,
       (SELECT COUNT(*)::int FROM course_reviews WHERE user_id = ANY($1::uuid[])) AS course_reviews,
       (SELECT COUNT(*)::int FROM spot_reviews WHERE user_id = ANY($1::uuid[])) AS spot_reviews,
       (SELECT COUNT(*)::int FROM bookmarks WHERE user_id = ANY($1::uuid[])) AS bookmarks,
       (SELECT COUNT(*)::int FROM reactions WHERE user_id = ANY($1::uuid[])) AS reactions,
       (SELECT COUNT(*)::int FROM taggings WHERE user_id = ANY($1::uuid[])) AS taggings,
       (SELECT COUNT(*)::int FROM reports WHERE memo LIKE $2) AS reports,
       (SELECT COUNT(*)::int FROM notifications WHERE message LIKE $2) AS notifications`,
    [DEMO_USERS.map((u) => u.userId), `${DEMO_TAG}%`]
  );
  console.log('\n──────── 시연 데이터 요약 ────────');
  console.table(s);
}

main()
  .catch((err) => {
    console.error('\n[seed] 실패:', err.response?.data || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dbPool) await dbPool.end();
  });
