require('dotenv').config();
const pool = require('./db');

// ─────────────────────────────────────────────────────────────────────
//  Seed Script  —  전체 테이블 테스트 데이터
//  실행: node config/seed.js
// ─────────────────────────────────────────────────────────────────────

// ── 고정 UUID (예측 가능한 테스트용) ─────────────────────────────────
const ID = {
  // users
  user1: '00000000-0000-0000-0000-000000000001',
  user2: '00000000-0000-0000-0000-000000000002',
  user3: '00000000-0000-0000-0000-000000000003',

  // tags
  tagRiver:  '11111111-0000-0000-0000-000000000001',
  tagPark:   '11111111-0000-0000-0000-000000000002',
  tagNight:  '11111111-0000-0000-0000-000000000003',
  tagTrail:  '11111111-0000-0000-0000-000000000004',
  tagPet:    '11111111-0000-0000-0000-000000000005',
  tagPaved:  '11111111-0000-0000-0000-000000000006',
  tagUphill: '11111111-0000-0000-0000-000000000007',
  tagShade:  '11111111-0000-0000-0000-000000000008',
  tagHist:   '11111111-0000-0000-0000-000000000009',
  tagFamily: '11111111-0000-0000-0000-000000000010',

  // courses
  course1: '22222222-0000-0000-0000-000000000001', // 여의도 한강 산책
  course2: '22222222-0000-0000-0000-000000000002', // 북악산 등산
  course3: '22222222-0000-0000-0000-000000000003', // 경복궁 역사 투어

  // pins (course1: 여의도)
  pin1_1: 'aaaaaaaa-0000-0000-0000-000000000001',
  pin1_2: 'aaaaaaaa-0000-0000-0000-000000000002',
  pin1_3: 'aaaaaaaa-0000-0000-0000-000000000003',
  // pins (course2: 북악산)
  pin2_1: 'aaaaaaaa-0000-0000-0000-000000000004',
  pin2_2: 'aaaaaaaa-0000-0000-0000-000000000005',
  pin2_3: 'aaaaaaaa-0000-0000-0000-000000000006',
  // pins (course3: 경복궁)
  pin3_1: 'aaaaaaaa-0000-0000-0000-000000000007',
  pin3_2: 'aaaaaaaa-0000-0000-0000-000000000008',

  // spots
  spot1: 'bbbbbbbb-0000-0000-0000-000000000001', // 한강 편의점
  spot2: 'bbbbbbbb-0000-0000-0000-000000000002', // 벚꽃 명소
  spot3: 'bbbbbbbb-0000-0000-0000-000000000003', // 북악산 전망대
  spot4: 'bbbbbbbb-0000-0000-0000-000000000004', // 경복궁 정문
  spot5: 'bbbbbbbb-0000-0000-0000-000000000005', // 카페

  // activity_records
  act1: '33333333-0000-0000-0000-000000000001', // user2 → course1
  act2: '33333333-0000-0000-0000-000000000002', // user3 → course1
  act3: '33333333-0000-0000-0000-000000000003', // user1 → course2
  act4: '33333333-0000-0000-0000-000000000004', // user2 → course3

  // course_reviews
  rev1: '44444444-0000-0000-0000-000000000001',
  rev2: '44444444-0000-0000-0000-000000000002',
  rev3: '44444444-0000-0000-0000-000000000003',
  rev4: '44444444-0000-0000-0000-000000000004',
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 0. 기존 테스트 데이터 정리 (의존성 역순) ─────────────────────
    await client.query(`DELETE FROM tts_audio_files    WHERE content_id IN ($1,$2,$3,$4,$5)`,
      [ID.course1, ID.course2, ID.course3, ID.spot3, ID.spot4]);
    await client.query(`DELETE FROM weather_cache      WHERE TRUE`);
    await client.query(`DELETE FROM notifications      WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM review_likes       WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM spot_reviews       WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM review_tag_selections WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM course_reviews     WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM reports            WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM activity_records   WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM bookmarks          WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM course_path        WHERE course_id IN ($1,$2,$3)`, [ID.course1, ID.course2, ID.course3]);
    await client.query(`DELETE FROM spot_images        WHERE user_id = $1`, [ID.user1]);
    await client.query(`DELETE FROM course_tags        WHERE course_id IN ($1,$2,$3)`, [ID.course1, ID.course2, ID.course3]);
    await client.query(`DELETE FROM courses            WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM nodes              WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM user_preferences   WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    await client.query(`DELETE FROM master_tags WHERE tag_name IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      ['강변','공원','야경','산책로','반려동물동반','포장도로','오르막','그늘','역사','가족']);
    await client.query(`DELETE FROM email_verifications WHERE email IN ($1,$2)`, ['user1@test.com', 'user2@test.com']);
    await client.query(`DELETE FROM users              WHERE user_id IN ($1,$2,$3)`, [ID.user1, ID.user2, ID.user3]);
    console.log('🧹 기존 테스트 데이터 정리 완료');

    // ── 1. users ─────────────────────────────────────────────────────
    const users = [
      { id: ID.user1, username: 'testuser1', email: 'user1@test.com', nickname: '테스터1' },
      { id: ID.user2, username: 'testuser2', email: 'user2@test.com', nickname: '테스터2' },
      { id: ID.user3, username: 'testuser3', email: 'user3@test.com', nickname: '테스터3' },
    ];
    for (const u of users) {
      await client.query(`
        INSERT INTO users (user_id, username, email, nickname, login_type)
        VALUES ($1, $2, $3, $4, 'local')
        ON CONFLICT (username) DO NOTHING
      `, [u.id, u.username, u.email, u.nickname]);
    }
    console.log('✅ users');

    // ── 2. email_verifications ────────────────────────────────────────
    await client.query(`
      INSERT INTO email_verifications (email, code, is_verified, expires_at)
      VALUES
        ('user1@test.com', '123456', TRUE,  NOW() + INTERVAL '1 hour'),
        ('user2@test.com', '654321', FALSE, NOW() + INTERVAL '10 minutes')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ email_verifications');

    // ── 3. master_tags ────────────────────────────────────────────────
    const tags = [
      { id: ID.tagRiver,  name: '강변',        category: '환경' },
      { id: ID.tagPark,   name: '공원',        category: '환경' },
      { id: ID.tagNight,  name: '야경',        category: '분위기' },
      { id: ID.tagTrail,  name: '산책로',      category: '환경' },
      { id: ID.tagPet,    name: '반려동물동반', category: '편의' },
      { id: ID.tagPaved,  name: '포장도로',    category: '지형' },
      { id: ID.tagUphill, name: '오르막',      category: '지형' },
      { id: ID.tagShade,  name: '그늘',        category: '환경' },
      { id: ID.tagHist,   name: '역사',        category: '테마' },
      { id: ID.tagFamily, name: '가족',        category: '테마' },
    ];
    for (const t of tags) {
      await client.query(`
        INSERT INTO master_tags (tag_id, tag_name, category, status, user_id)
        VALUES ($1, $2, $3, 'approved', $4)
        ON CONFLICT (tag_name) DO NOTHING
      `, [t.id, t.name, t.category, ID.user1]);
    }
    console.log('✅ master_tags');

    // ── 4. user_preferences ──────────────────────────────────────────
    const prefs = [
      { user: ID.user1, tag: ID.tagRiver,  score: 5 },
      { user: ID.user1, tag: ID.tagPark,   score: 4 },
      { user: ID.user1, tag: ID.tagShade,  score: 4 },
      { user: ID.user2, tag: ID.tagUphill, score: 5 },
      { user: ID.user2, tag: ID.tagTrail,  score: 4 },
      { user: ID.user3, tag: ID.tagNight,  score: 5 },
      { user: ID.user3, tag: ID.tagHist,   score: 4 },
      { user: ID.user3, tag: ID.tagFamily, score: 3 },
    ];
    for (const p of prefs) {
      await client.query(`
        INSERT INTO user_preferences (user_id, tag_id, preference_score)
        VALUES ($1, $2, $3)
        ON CONFLICT ON CONSTRAINT uq_user_preference_tag DO NOTHING
      `, [p.user, p.tag, p.score]);
    }
    console.log('✅ user_preferences');

    // ── 5. nodes (pins) ───────────────────────────────────────────────
    const pins = [
      // course1: 여의도 한강 (서→동)
      { id: ID.pin1_1, lat: 37.5285, lng: 126.9326, label: '여의도 출발' },
      { id: ID.pin1_2, lat: 37.5289, lng: 126.9390, label: '여의도 중간' },
      { id: ID.pin1_3, lat: 37.5280, lng: 126.9450, label: '여의도 도착' },
      // course2: 북악산
      { id: ID.pin2_1, lat: 37.5895, lng: 126.9768, label: '북악산 입구' },
      { id: ID.pin2_2, lat: 37.5940, lng: 126.9800, label: '북악산 중턱' },
      { id: ID.pin2_3, lat: 37.5980, lng: 126.9820, label: '북악산 정상' },
      // course3: 경복궁
      { id: ID.pin3_1, lat: 37.5796, lng: 126.9770, label: '경복궁 출발' },
      { id: ID.pin3_2, lat: 37.5820, lng: 126.9810, label: '경복궁 도착' },
    ];
    for (const p of pins) {
      await client.query(`
        INSERT INTO nodes (node_id, node_type, location, label, user_id)
        VALUES ($1, 'pin', ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5)
        ON CONFLICT (node_id) DO NOTHING
      `, [p.id, p.lat, p.lng, p.label, ID.user1]);
    }
    console.log('✅ nodes (pins)');

    // ── 5b. nodes (spots) ─────────────────────────────────────────────
    const spots = [
      { id: ID.spot1, lat: 37.5287, lng: 126.9360, name: '한강 편의점',   desc: '24시간 운영 편의점', types: { food: true } },
      { id: ID.spot2, lat: 37.5283, lng: 126.9420, name: '여의도 벚꽃길', desc: '봄에 특히 아름다운 벚꽃 명소', types: { nature: true } },
      { id: ID.spot3, lat: 37.5950, lng: 126.9810, name: '북악산 전망대', desc: '서울 시내가 한눈에 보이는 전망대', types: { view: true } },
      { id: ID.spot4, lat: 37.5796, lng: 126.9770, name: '경복궁 정문',   desc: '광화문. 조선 왕조의 정궁 정문', types: { history: true } },
      { id: ID.spot5, lat: 37.5800, lng: 126.9790, name: '인사동 카페',   desc: '전통 분위기의 한옥 카페', types: { cafe: true } },
    ];
    for (const s of spots) {
      await client.query(`
        INSERT INTO nodes (node_id, node_type, location, name, description, content_types, is_deleted, is_hidden, report_count, user_id)
        VALUES ($1, 'spot', ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5, $6, FALSE, FALSE, 0, $7)
        ON CONFLICT (node_id) DO NOTHING
      `, [s.id, s.lat, s.lng, s.name, s.desc, JSON.stringify(s.types), ID.user1]);
    }
    console.log('✅ nodes (spots)');

    // ── 6. spot_images ────────────────────────────────────────────────
    const images = [
      { node: ID.spot1, url: 'https://example.com/img/convenience.jpg', caption: '편의점 외관', order: 0 },
      { node: ID.spot2, url: 'https://example.com/img/cherry1.jpg',     caption: '벚꽃 전경',   order: 0 },
      { node: ID.spot2, url: 'https://example.com/img/cherry2.jpg',     caption: '벚꽃 클로즈업', order: 1 },
      { node: ID.spot3, url: 'https://example.com/img/view.jpg',        caption: '서울 전망',   order: 0 },
      { node: ID.spot4, url: 'https://example.com/img/gwanghwamun.jpg', caption: '광화문 정면', order: 0 },
      { node: ID.spot5, url: 'https://example.com/img/cafe.jpg',        caption: '카페 내부',   order: 0 },
    ];
    for (const img of images) {
      await client.query(`
        INSERT INTO spot_images (node_id, image_url, caption, display_order, user_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [img.node, img.url, img.caption, img.order, ID.user1]);
    }
    console.log('✅ spot_images');

    // ── 7. courses ────────────────────────────────────────────────────
    const courses = [
      {
        id: ID.course1, userId: ID.user1,
        title: '여의도 한강 산책',
        desc:  '여의도 한강공원을 가로지르는 평탄한 산책 코스',
        dist: 1.8, min: 30, diff: 1,
      },
      {
        id: ID.course2, userId: ID.user2,
        title: '북악산 등산 코스',
        desc:  '서울 도심에서 즐기는 오르막 등산 코스',
        dist: 4.2, min: 90, diff: 3,
      },
      {
        id: ID.course3, userId: ID.user1,
        title: '경복궁 역사 투어',
        desc:  '경복궁과 인사동을 잇는 역사 문화 산책로',
        dist: 2.5, min: 50, diff: 1,
      },
    ];
    for (const c of courses) {
      await client.query(`
        INSERT INTO courses (course_id, user_id, title, description, creation_type,
                             total_distance_km, estimated_minutes, difficulty, visibility)
        VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, 'public')
        ON CONFLICT (course_id) DO NOTHING
      `, [c.id, c.userId, c.title, c.desc, c.dist, c.min, c.diff]);
    }
    console.log('✅ courses');

    // ── 8. course_tags ────────────────────────────────────────────────
    const courseTags = [
      { course: ID.course1, tag: ID.tagRiver },
      { course: ID.course1, tag: ID.tagPark },
      { course: ID.course1, tag: ID.tagPet },
      { course: ID.course1, tag: ID.tagPaved },
      { course: ID.course2, tag: ID.tagUphill },
      { course: ID.course2, tag: ID.tagTrail },
      { course: ID.course2, tag: ID.tagShade },
      { course: ID.course3, tag: ID.tagHist },
      { course: ID.course3, tag: ID.tagFamily },
      { course: ID.course3, tag: ID.tagPaved },
    ];
    for (const ct of courseTags) {
      await client.query(`
        INSERT INTO course_tags (course_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT ON CONSTRAINT uq_course_tag_mapping DO NOTHING
      `, [ct.course, ct.tag]);
    }
    console.log('✅ course_tags');

    // ── 9. course_path ────────────────────────────────────────────────
    const paths = [
      // course1: 핀3개 + 스팟2개
      { course: ID.course1, node: ID.pin1_1, order: 1 },
      { course: ID.course1, node: ID.spot1,  order: 2 },
      { course: ID.course1, node: ID.pin1_2, order: 3 },
      { course: ID.course1, node: ID.spot2,  order: 4 },
      { course: ID.course1, node: ID.pin1_3, order: 5 },
      // course2: 핀3개 + 스팟1개
      { course: ID.course2, node: ID.pin2_1, order: 1 },
      { course: ID.course2, node: ID.pin2_2, order: 2 },
      { course: ID.course2, node: ID.spot3,  order: 3 },
      { course: ID.course2, node: ID.pin2_3, order: 4 },
      // course3: 핀2개 + 스팟2개
      { course: ID.course3, node: ID.pin3_1, order: 1 },
      { course: ID.course3, node: ID.spot4,  order: 2 },
      { course: ID.course3, node: ID.spot5,  order: 3 },
      { course: ID.course3, node: ID.pin3_2, order: 4 },
    ];
    for (const p of paths) {
      await client.query(`
        INSERT INTO course_path (course_id, node_id, node_order)
        VALUES ($1, $2, $3)
        ON CONFLICT ON CONSTRAINT uq_course_path_node DO NOTHING
      `, [p.course, p.node, p.order]);
    }
    console.log('✅ course_path');

    // ── 10. activity_records ──────────────────────────────────────────
    const activities = [
      {
        id: ID.act1, user: ID.user2, course: ID.course1,
        started: '2025-04-01 09:00:00+09', ended: '2025-04-01 09:32:00+09',
        duration: 1920, dist: 1.8, steps: 2400, completed: true, status: 'completed',
      },
      {
        id: ID.act2, user: ID.user3, course: ID.course1,
        started: '2025-04-03 17:00:00+09', ended: '2025-04-03 17:28:00+09',
        duration: 1680, dist: 1.75, steps: 2200, completed: true, status: 'completed',
      },
      {
        id: ID.act3, user: ID.user1, course: ID.course2,
        started: '2025-04-05 07:00:00+09', ended: '2025-04-05 08:35:00+09',
        duration: 5700, dist: 4.1, steps: 5800, completed: true, status: 'completed',
      },
      {
        id: ID.act4, user: ID.user2, course: ID.course3,
        started: '2025-04-07 14:00:00+09', ended: '2025-04-07 14:52:00+09',
        duration: 3120, dist: 2.4, steps: 3200, completed: true, status: 'completed',
      },
    ];
    for (const a of activities) {
      await client.query(`
        INSERT INTO activity_records
          (activity_record_id, user_id, course_id, started_at, ended_at,
           duration_seconds, actual_distance_km, step_count, is_completed, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (activity_record_id) DO NOTHING
      `, [a.id, a.user, a.course, a.started, a.ended, a.duration, a.dist, a.steps, a.completed, a.status]);
    }
    console.log('✅ activity_records');

    // ── 11. reports ───────────────────────────────────────────────────
    const reports = [
      {
        user: ID.user3, course: ID.course2, node: null,
        lat: 37.5940, lng: 126.9800,
        type: '위험구간', desc: '비 온 후 미끄러운 구간 있음',
      },
      {
        user: ID.user2, course: null, node: ID.spot1,
        lat: 37.5287, lng: 126.9360,
        type: '정보오류', desc: '편의점 현재 영업 안 함',
      },
    ];
    for (const r of reports) {
      await client.query(`
        INSERT INTO reports (user_id, course_id, node_id, location, report_type, description, status)
        VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326), $6, $7, 'active')
        ON CONFLICT DO NOTHING
      `, [r.user, r.course, r.node, r.lat, r.lng, r.type, r.desc]);
    }
    console.log('✅ reports');

    // ── 12. course_reviews ────────────────────────────────────────────
    const reviews = [
      { id: ID.rev1, act: ID.act1, user: ID.user2, course: ID.course1, rating: 5, content: '한강 뷰가 정말 좋아요! 저녁에 걸으면 야경도 예쁩니다.' },
      { id: ID.rev2, act: ID.act2, user: ID.user3, course: ID.course1, rating: 4, content: '평탄하고 걷기 편해요. 반려동물과 함께 오기 좋습니다.' },
      { id: ID.rev3, act: ID.act3, user: ID.user1, course: ID.course2, rating: 3, content: '경치는 훌륭하지만 오르막이 꽤 힘들어요. 체력 있으신 분께 추천!' },
      { id: ID.rev4, act: ID.act4, user: ID.user2, course: ID.course3, rating: 5, content: '역사 공부도 되고 걷기도 좋아요. 외국인 친구 데려오기 딱 좋은 코스!' },
    ];
    for (const r of reviews) {
      await client.query(`
        INSERT INTO course_reviews
          (course_review_id, activity_record_id, user_id, course_id, rating, content, visibility)
        VALUES ($1, $2, $3, $4, $5, $6, 'public')
        ON CONFLICT (course_review_id) DO NOTHING
      `, [r.id, r.act, r.user, r.course, r.rating, r.content]);
    }
    console.log('✅ course_reviews');

    // ── 13. review_tag_selections ─────────────────────────────────────
    const tagSelections = [
      { rev: ID.rev1, course: ID.course1, user: ID.user2, tag: ID.tagRiver },
      { rev: ID.rev1, course: ID.course1, user: ID.user2, tag: ID.tagNight },
      { rev: ID.rev2, course: ID.course1, user: ID.user3, tag: ID.tagPet },
      { rev: ID.rev2, course: ID.course1, user: ID.user3, tag: ID.tagPark },
      { rev: ID.rev3, course: ID.course2, user: ID.user1, tag: ID.tagUphill },
      { rev: ID.rev3, course: ID.course2, user: ID.user1, tag: ID.tagTrail },
      { rev: ID.rev4, course: ID.course3, user: ID.user2, tag: ID.tagHist },
      { rev: ID.rev4, course: ID.course3, user: ID.user2, tag: ID.tagFamily },
    ];
    for (const ts of tagSelections) {
      await client.query(`
        INSERT INTO review_tag_selections (course_review_id, course_id, user_id, tag_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ON CONSTRAINT uq_review_tag DO NOTHING
      `, [ts.rev, ts.course, ts.user, ts.tag]);
    }
    console.log('✅ review_tag_selections');

    // ── 14. review_likes ──────────────────────────────────────────────
    const revLikes = [
      { rev: ID.rev1, user: ID.user1, like: true  },
      { rev: ID.rev1, user: ID.user3, like: true  },
      { rev: ID.rev2, user: ID.user1, like: true  },
      { rev: ID.rev3, user: ID.user2, like: false },
      { rev: ID.rev4, user: ID.user1, like: true  },
      { rev: ID.rev4, user: ID.user3, like: true  },
    ];
    for (const l of revLikes) {
      await client.query(`
        INSERT INTO review_likes (course_review_id, user_id, is_like)
        VALUES ($1, $2, $3)
        ON CONFLICT ON CONSTRAINT uq_review_like DO NOTHING
      `, [l.rev, l.user, l.like]);
    }
    console.log('✅ review_likes');

    // ── 15. spot_reviews ──────────────────────────────────────────────
    const spotReviews = [
      { node: ID.spot1, user: ID.user2, rec: true  },
      { node: ID.spot1, user: ID.user3, rec: false },
      { node: ID.spot2, user: ID.user1, rec: true  },
      { node: ID.spot2, user: ID.user2, rec: true  },
      { node: ID.spot3, user: ID.user1, rec: true  },
      { node: ID.spot4, user: ID.user2, rec: true  },
      { node: ID.spot4, user: ID.user3, rec: true  },
      { node: ID.spot5, user: ID.user1, rec: true  },
    ];
    for (const sr of spotReviews) {
      await client.query(`
        INSERT INTO spot_reviews (node_id, user_id, is_recommended)
        VALUES ($1, $2, $3)
        ON CONFLICT ON CONSTRAINT uq_spot_review DO NOTHING
      `, [sr.node, sr.user, sr.rec]);
    }
    console.log('✅ spot_reviews');

    // ── 16. bookmarks ─────────────────────────────────────────────────
    const bookmarks = [
      { user: ID.user1, course: ID.course1 },
      { user: ID.user1, course: ID.course2 },
      { user: ID.user2, course: ID.course1 },
      { user: ID.user2, course: ID.course3 },
      { user: ID.user3, course: ID.course1 },
      { user: ID.user3, course: ID.course3 },
    ];
    for (const b of bookmarks) {
      await client.query(`
        INSERT INTO bookmarks (user_id, course_id)
        VALUES ($1, $2)
        ON CONFLICT ON CONSTRAINT uq_bookmark DO NOTHING
      `, [b.user, b.course]);
    }
    console.log('✅ bookmarks');

    // ── 17. notifications ─────────────────────────────────────────────
    const notifs = [
      { user: ID.user1, type: 'review',   target_type: 'course', target: ID.course1, msg: '내 코스에 새 리뷰가 달렸어요!' },
      { user: ID.user1, type: 'bookmark', target_type: 'course', target: ID.course1, msg: '내 코스가 북마크되었어요!' },
      { user: ID.user2, type: 'review',   target_type: 'course', target: ID.course3, msg: '내 코스에 새 리뷰가 달렸어요!' },
    ];
    for (const n of notifs) {
      await client.query(`
        INSERT INTO notifications (user_id, type, target_type, target_id, message)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [n.user, n.type, n.target_type, n.target, n.msg]);
    }
    console.log('✅ notifications');

    // ── 18. weather_cache ─────────────────────────────────────────────
    const weathers = [
      { lat: 37.5285, lng: 126.9326, cond: '맑음',  temp: 18.5, desc: '화창한 날씨' },
      { lat: 37.5895, lng: 126.9768, cond: '흐림',  temp: 14.2, desc: '구름 많음' },
      { lat: 37.5796, lng: 126.9770, cond: '맑음',  temp: 19.0, desc: '산책하기 좋은 날씨' },
    ];
    for (const w of weathers) {
      await client.query(`
        INSERT INTO weather_cache (location, weather_condition, temperature, description, expires_at)
        VALUES (ST_SetSRID(ST_MakePoint($2, $1), 4326), $3, $4, $5, NOW() + INTERVAL '1 hour')
        ON CONFLICT DO NOTHING
      `, [w.lat, w.lng, w.cond, w.temp, w.desc]);
    }
    console.log('✅ weather_cache');

    // ── 19. tts_audio_files ───────────────────────────────────────────
    const ttsFiles = [
      {
        key: 'course_' + ID.course1, ctype: 'course', id: ID.course1,
        src: '여의도 한강 산책 코스입니다. 총 거리 1.8킬로미터, 예상 소요시간 30분입니다.',
        status: 'done', url: 'https://example.com/tts/course1.mp3',
      },
      {
        key: 'spot_' + ID.spot4, ctype: 'spot', id: ID.spot4,
        src: '경복궁 정문, 광화문입니다. 조선 왕조의 정궁 경복궁의 정문으로 1395년에 창건되었습니다.',
        status: 'done', url: 'https://example.com/tts/spot_gwanghwamun.mp3',
        spot_ctype: '역사',
      },
      {
        key: 'spot_' + ID.spot3, ctype: 'spot', id: ID.spot3,
        src: '북악산 전망대입니다. 서울 시내가 한눈에 내려다보이는 전망 포인트입니다.',
        status: 'pending', url: null,
        spot_ctype: '명소',
      },
    ];
    for (const t of ttsFiles) {
      await client.query(`
        INSERT INTO tts_audio_files
          (cache_key, content_type, content_id, source_text, status, audio_url, spot_content_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (cache_key) DO NOTHING
      `, [t.key, t.ctype, t.id, t.src, t.status, t.url || null, t.spot_ctype || null]);
    }
    console.log('✅ tts_audio_files');

    await client.query('COMMIT');

    // ── 요약 출력 ─────────────────────────────────────────────────────
    console.log('\n====================================================');
    console.log('🎉 시드 완료!\n');

    console.log('👤 유저 UUID (JWT 토큰 생성 시 userId로 사용):');
    console.log(`  테스터1 (코스 등록자): ${ID.user1}`);
    console.log(`  테스터2             : ${ID.user2}`);
    console.log(`  테스터3             : ${ID.user3}`);

    console.log('\n📍 코스 UUID:');
    console.log(`  여의도 한강 산책  : ${ID.course1}`);
    console.log(`  북악산 등산 코스  : ${ID.course2}`);
    console.log(`  경복궁 역사 투어  : ${ID.course3}`);

    console.log('\n📌 핀 UUID (POST /api/courses pins 배열):');
    console.log(`  여의도 출발: ${ID.pin1_1}`);
    console.log(`  여의도 중간: ${ID.pin1_2}`);
    console.log(`  여의도 도착: ${ID.pin1_3}`);

    console.log('\n📍 스팟 UUID (POST /api/courses spots 배열):');
    console.log(`  한강 편의점 : ${ID.spot1}`);
    console.log(`  여의도 벚꽃 : ${ID.spot2}`);

    console.log('\n🏷️  태그 UUID (POST /api/courses tags 배열):');
    console.log(`  강변: ${ID.tagRiver}  공원: ${ID.tagPark}`);
    console.log(`  역사: ${ID.tagHist}  가족: ${ID.tagFamily}`);
    console.log('====================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 시드 실패:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
