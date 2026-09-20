/**
 * services/courseTagService.js
 *
 * 코스-태그 연결을 "최대화"하기 위한 자동 태깅 유틸.
 *
 * 문제: 두루누비/길관광 코스 importer 는 코스당 단일 태그(둘레길/관광코스)만
 *      붙여서, 코스 경유지 스팟이 이미 가진 세부 태그(무장애/반려견/음성해설 등)와
 *      코스 설명 텍스트가 코스 레벨 태그로 승격되지 않았다.
 *
 * 해결:
 *   1) 경유지 스팟의 태그를 코스로 "승격(roll-up)" 하여 코스 검색에서 잡히게 한다.
 *      - 예: 스팟에 '반려견동반'이 있으면 코스에도 '반려동물' 태그 부여
 *      - 예: 스팟에 '열린관광/휠체어 대여'가 있으면 코스에도 '무장애길' 부여
 *   2) 코스 설명(summary/content/traveler_info) 텍스트에서 키워드를 추출해 코스 태그 도출
 *   3) 코스 카테고리(둘레길·트레킹/수변·공원길/도심·골목산책)도 표준 태그로 매핑
 *
 * 모든 태깅은 taggings.user_id(NOT NULL, FK) 를 만족하기 위해 실제 user_id 를
 * 반드시 사용한다(코스 소유자 또는 시스템 관리자 계정).
 */

const pool = require('../config/db');

// ──────────────────────────────────────────────────────────
// 시스템 태깅 계정 (spotService 와 동일 규칙)
// ──────────────────────────────────────────────────────────
let cachedSystemTaggerId = null;

async function ensureSystemTaggerId(client = pool) {
  if (cachedSystemTaggerId) return cachedSystemTaggerId;

  const { rows: admins } = await client.query(
    `SELECT user_id FROM users
     WHERE role = 'admin' AND status = 'active'
     ORDER BY created_at LIMIT 1`
  );
  if (admins.length) {
    cachedSystemTaggerId = admins[0].user_id;
    return cachedSystemTaggerId;
  }

  const { rows: seedUsers } = await client.query(
    `SELECT user_id FROM users
     WHERE social_provider = 'seed' AND social_id = 'system-tagger' LIMIT 1`
  );
  if (seedUsers.length) {
    cachedSystemTaggerId = seedUsers[0].user_id;
    return cachedSystemTaggerId;
  }

  try {
    const { rows: created } = await client.query(
      `INSERT INTO users (nickname, social_provider, social_id, role, status)
       VALUES ('자동태깅', 'seed', 'system-tagger', 'admin', 'active')
       ON CONFLICT (nickname) DO NOTHING
       RETURNING user_id`
    );
    if (created.length) {
      cachedSystemTaggerId = created[0].user_id;
      return cachedSystemTaggerId;
    }
  } catch (err) {
    console.warn('[ensureSystemTaggerId/course] 시스템 태거 생성 실패, 재조회:', err.message);
  }

  // nickname 충돌 등으로 생성 실패 → social 기준 재조회
  const { rows: retry } = await client.query(
    `SELECT user_id FROM users
     WHERE social_provider = 'seed' AND social_id = 'system-tagger' LIMIT 1`
  );
  cachedSystemTaggerId = retry[0]?.user_id || null;
  return cachedSystemTaggerId;
}

// ──────────────────────────────────────────────────────────
// 스팟 태그 → 코스 태그 승격 규칙
//   (spot tag name) → (course tag name)
// ──────────────────────────────────────────────────────────
const SPOT_TO_COURSE_TAG_MAP = {
  '열린관광': '무장애길',
  '무단차통로': '무장애길',
  '주출입구 진입로': '무장애길',
  '휠체어접근': '무장애길',
  '휠체어 대여': '무장애길',
  '장애인화장실': '무장애길',
  '장애인 화장실': '무장애길',
  '장애인주차': '무장애길',
  '장애인 주차구역': '무장애길',
  '엘리베이터': '무장애길',
  '유모차대여': '아이와함께',
  '유모차 대여': '아이와함께',
  '수유실': '아이와함께',
  '반려견동반': '반려동물',
  '대형견가능': '반려동물',
  '소형견동반': '반려동물',
  '반려견배변시설': '반려동물',
  '반려견놀이터': '반려동물',
};

// ──────────────────────────────────────────────────────────
// 코스 설명 텍스트 → 코스 태그 도출 키워드
// ──────────────────────────────────────────────────────────
const DESCRIPTION_TAG_RULES = [
  { tag: '힐링', keywords: ['힐링', '조용', '고요', '여유', '쉼', '치유', '명상'] },
  { tag: '노을·야경', keywords: ['야경', '노을', '일몰', '밤산책', '야간', '달빛', '조명'] },
  { tag: '자연·풍경', keywords: ['숲길', '바다', '강변', '호수', '피톤치드', '물멍', '자연', '녹음', '계곡'] },
  { tag: '역사·문화', keywords: ['역사', '문화', '고궁', '한옥', '성곽', '옛길', '유적', '골목'] },
  // 보행 약자/반려견 안전을 위해 단순 단어가 아닌 명시적 공식 문구만 매칭
  { tag: '무장애길', keywords: ['무장애길', '무장애나눔길', '무장애탐방로', '열린관광길', '배리어프리길'] },
  { tag: '반려동물', keywords: ['반려견 동반 산책', '반려동물 동반 산책', '반려견과 함께', '반려동물과 함께', '애견 동반 산책'] },
  { tag: '아이와함께', keywords: ['유아차 이동 가능', '어린이 생태체험', '가족과 함께 걷기 좋은'] },
];

// 코스 카테고리 → 코스 태그 매핑
const CATEGORY_TAG_MAP = {
  '둘레길': '둘레길',
  '둘레길·트레킹': '둘레길',
  '수변·공원길': '힐링',
  '도심·골목산책': '추천코스',
  '관광코스': '관광코스',
};

/**
 * 코스 하나의 태그명 집합을 계산한다.
 * @param {object} params
 * @param {string} params.courseId
 * @param {string|null} params.courseName
 * @param {string|null} params.category
 * @param {string|null} params.description  (raw 또는 파싱 전 텍스트)
 * @param {object} [params.sections]        parseDescriptionSections 결과 (있으면 우선 사용)
 * @param {string|null} [params.dataSource] 출처
 * @param {string} [client]
 * @returns {Promise<string[]>} 코스 태그명 목록
 */
async function deriveCourseTagNames({ courseId, courseName, category, description, sections, dataSource, isOfficial }, client = pool) {
  const tagNames = new Set();

  // 1) 코스 출처 판별 (공식코스 vs 사용자코스)
  let official = isOfficial;
  if (official === undefined && courseId) {
    const { rows: [c] } = await client.query(
      `SELECT c.data_source, u.role
       FROM courses c
       LEFT JOIN users u ON u.user_id = c.owner_id
       WHERE c.course_id = $1`,
      [courseId]
    );
    official = Boolean(c?.data_source || c?.role === 'admin');
  } else if (official === undefined) {
    official = Boolean(dataSource);
  }

  if (official) {
    tagNames.add('공식코스');
  } else {
    tagNames.add('사용자코스');
  }

  // 2) 카테고리 기반
  if (category && CATEGORY_TAG_MAP[category]) {
    tagNames.add(CATEGORY_TAG_MAP[category]);
  }

  // 3) 설명 텍스트 기반
  const text = [
    courseName || '',
    description || '',
    sections?.summary?.join(' ') || '',
    sections?.content || '',
    sections?.traveler_info?.join(' ') || '',
  ].join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  for (const rule of DESCRIPTION_TAG_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      tagNames.add(rule.tag);
    }
  }

  // 4) 코스 명칭에 공인 무장애 명칭 포함 시 공식 무장애길 확정
  if (courseName && /(무장애|무장애길|무장애나눔길|무장애탐방로|배리어프리)/.test(courseName)) {
    tagNames.add('무장애길');
  }

  // 5) 코스 명칭에 '봄내길' 포함 시 '춘천 봄내길' 태그 부여
  if (courseName && courseName.includes('봄내길')) {
    tagNames.add('춘천 봄내길');
  }

  return [...tagNames];
}

/**
 * 코스에 태그명 목록을 부착한다. (tags 자동 등록 + taggings 등록)
 * @param {string} courseId
 * @param {string[]} tagNames
 * @param {string} [userId]  없으면 시스템 태깅 계정 사용
 * @param {string} [client]
 */
async function attachTagsToCourse(courseId, tagNames, userId, client = pool) {
  if (!courseId || !Array.isArray(tagNames) || tagNames.length === 0) return [];
  const cleanNames = [...new Set(
    tagNames.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean)
  )];
  if (cleanNames.length === 0) return [];

  const taggerId = userId || await ensureSystemTaggerId(client);

  const attached = [];
  for (const name of cleanNames) {
    // tags 조회 및 없으면 안전하게 등록
    const { rows: [tag] } = await client.query(
      `SELECT tag_id, name FROM tags WHERE name = $1 AND type = 'course' AND is_active = TRUE`,
      [name]
    );
    if (!tag) continue;

    await client.query(
      `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
       VALUES ($1, $2, 'course', $3)
       ON CONFLICT DO NOTHING`,
      [tag.tag_id, courseId, taggerId]
    );
    attached.push(tag.name);
  }
  return attached;
}

/**
 * 코스 하나를 자동 태깅(도출 + 부착)하는 편의 함수.
 */
async function autoTagCourse({ courseId, courseName, category, description, sections, dataSource, isOfficial, userId }, client = pool) {
  const tagNames = await deriveCourseTagNames({ courseId, courseName, category, description, sections, dataSource, isOfficial }, client);
  if (tagNames.length === 0) return [];
  return attachTagsToCourse(courseId, tagNames, userId, client);
}

module.exports = {
  ensureSystemTaggerId,
  deriveCourseTagNames,
  attachTagsToCourse,
  autoTagCourse,
  SPOT_TO_COURSE_TAG_MAP,
  CATEGORY_TAG_MAP,
  DESCRIPTION_TAG_RULES,
};
