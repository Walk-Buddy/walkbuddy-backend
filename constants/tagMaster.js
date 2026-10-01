/**
 * 태그 정본 목록 — db/schema.sql 의 태그 시드와 반드시 같게 유지한다.
 *
 * IMPORTANT: import·동기화 코드는 이 목록에 있는 태그만 붙인다. 목록에 없는 이름으로 태그를 새로 만들지 말 것.
 * 예전에는 모르는 이름이 오면 tags 에 자동으로 만들어서(그룹 '기타') 같은 뜻의 태그가 두 개씩 생겼다.
 * (반려견동반/반려동물, 대형견가능/대형견 동반, 야간명소/밤산책, 관광코스/추천코스 등)
 * 외부 데이터가 다른 이름을 쓰면 TAG_ALIASES 에 정본 이름을 적는다.
 */

const COURSE_TAGS = [
  // 코스 출처 (시스템 전용, 후기 불가)
  { name: '공식코스', group: '코스 출처', review: false },
  { name: '사용자코스', group: '코스 출처', review: false },
  // 추천·종류 (시스템/에디터 추천, 후기 불가)
  { name: '추천코스', group: '추천·종류', review: false },
  { name: '둘레길', group: '추천·종류', review: false },
  { name: '춘천 봄내길', group: '추천·종류', review: false },
  // 분위기 (후기 가능)
  { name: '힐링', group: '분위기', review: true },
  { name: '노을·야경', group: '분위기', review: true },
  { name: '자연·풍경', group: '분위기', review: true },
  { name: '역사·문화', group: '분위기', review: true },
  // 동반·접근성 (무장애길은 인증 전용)
  { name: '무장애길', group: '동반·접근성', review: false },
  { name: '반려동물', group: '동반·접근성', review: true },
  { name: '아이와함께', group: '동반·접근성', review: true },
];

const SPOT_TAGS = [
  // 열린관광 (무장애 편의시설 12개, 후기 불가)
  ...['무단차통로', '휠체어접근', '휠체어대여', '장애인주차', '장애인화장실', '엘리베이터',
    '안내견동반', '시각장애인음성안내', '점자안내', '수어안내', '유모차대여', '수유실']
    .map((name) => ({ name, group: '열린관광', review: false })),
  // 반려동물 (한국관광공사 공인 데이터, 후기 불가)
  ...['반려동물', '소형견동반', '대형견 동반', '반려견배변시설', '반려견놀이터']
    .map((name) => ({ name, group: '반려동물', review: false })),
  // 시설·편의 (후기 가능)
  ...['화장실', '주차가능', '식수대', '벤치·쉼터'].map((name) => ({ name, group: '시설·편의', review: true })),
  // 분위기·테마
  { name: 'Odii음성해설', group: '분위기·테마', review: false },
  { name: '실시간축제', group: '분위기·테마', review: false },
  ...['포토존', '전통·한옥', '낮그늘', '밤산책', '일출명소', '일몰명소', '문화/예술', '역사유적']
    .map((name) => ({ name, group: '분위기·테마', review: true })),
  // 계절 태그 (해당 계절에만 활성)
  { name: '벚꽃', group: '분위기·테마', review: true, active: false },
  { name: '단풍', group: '분위기·테마', review: true, active: false },
];

/** 외부 데이터·옛 태그 이름 → 정본 이름. null 이면 태그를 붙이지 않는다. */
const TAG_ALIASES = {
  course: {
    관광코스: '추천코스',
    추천산책로: '추천코스',
  },
  spot: {
    반려견동반: '반려동물',
    반려견: '반려동물',
    대형견가능: '대형견 동반',
    대형견: '대형견 동반',
    야간명소: '밤산책',
    야경명소: '밤산책',
    야간개방: '밤산책',
    주차: '주차가능',
    주차장: '주차가능',
    // 열린관광 여부는 spots.barrier_free_info 로 판단한다 (세부 편의시설 12개만 태그)
    열린관광: null,
    무장애: null,
    '카페&식당': null,
  },
};

const MASTER = { course: COURSE_TAGS, spot: SPOT_TAGS };
const MASTER_NAMES = {
  course: new Set(COURSE_TAGS.map((t) => t.name)),
  spot: new Set(SPOT_TAGS.map((t) => t.name)),
};

/** 정본 이름으로 바꾼다. 정본에 없는 이름이면 null. */
function canonicalTagName(rawName, type = 'spot') {
  const name = String(rawName || '').trim().replace(/^#/, '');
  if (!name) return null;
  const aliases = TAG_ALIASES[type] || {};
  const resolved = Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name] : name;
  return resolved && MASTER_NAMES[type]?.has(resolved) ? resolved : null;
}

/** 이름 목록을 정본 이름 목록으로 (중복·정본 외 이름 제거) */
function canonicalTagNames(names = [], type = 'spot') {
  return [...new Set(names.map((n) => canonicalTagName(n, type)).filter(Boolean))];
}

/**
 * 정본 태그의 tag_id 조회. 태그를 새로 만들지 않는다. (db: pool 또는 트랜잭션 client)
 * @returns {Promise<Array<{tag_id: string, name: string}>>}
 */
async function findCanonicalTags(db, names = [], type = 'spot') {
  const canonical = canonicalTagNames(names, type);
  if (canonical.length === 0) return [];
  const { rows } = await db.query(
    'SELECT tag_id, name FROM tags WHERE name = ANY($1::TEXT[]) AND type = $2',
    [canonical, type],
  );
  return rows;
}

/** 정본 태그 하나의 tag_id (없으면 오류: sync-tag-master 를 먼저 실행해야 한다) */
async function requireCanonicalTagId(db, name, type) {
  const [tag] = await findCanonicalTags(db, [name], type);
  if (!tag) throw new Error(`정본 태그 '${name}'(${type})가 DB에 없습니다. npm run sync:tags -- --apply 를 먼저 실행하세요.`);
  return tag.tag_id;
}

module.exports = {
  MASTER,
  MASTER_NAMES,
  TAG_ALIASES,
  canonicalTagName,
  canonicalTagNames,
  findCanonicalTags,
  requireCanonicalTagId,
};
