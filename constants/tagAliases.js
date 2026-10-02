/**
 * 외부 데이터·옛 태그 이름 → 정본 태그 이름.
 *
 * 정본 태그 목록은 DB(tags)에만 있다 — db/schema.sql 시드와 chk_tags_master 제약.
 * IMPORTANT: 코드에서 tags 에 INSERT 하지 말 것. DB 에 있는 태그를 찾아서 붙이기만 한다.
 * TourAPI 등 외부 데이터가 정본과 다른 이름을 쓰면 여기에 정본 이름을 적는다. (null: 태그를 붙이지 않음)
 */
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
    // 열린관광 여부는 spots.barrier_free_info 로 판단한다 (세부 편의시설만 태그)
    열린관광: null,
    무장애: null,
  },
};

function canonicalTagName(rawName, type = 'spot') {
  const name = String(rawName || '').trim().replace(/^#/, '');
  if (!name) return null;
  const aliases = TAG_ALIASES[type] || {};
  return Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name] : name;
}

/**
 * 이름 목록에 해당하는 DB 태그 조회 (DB 에 없는 이름은 버린다. 태그를 새로 만들지 않는다)
 * @param db pool 또는 트랜잭션 client
 * @returns {Promise<Array<{tag_id: string, name: string}>>}
 */
async function findTags(db, names = [], type = 'spot') {
  const canonical = [...new Set(names.map((n) => canonicalTagName(n, type)).filter(Boolean))];
  if (canonical.length === 0) return [];
  const { rows } = await db.query(
    'SELECT tag_id, name FROM tags WHERE name = ANY($1::TEXT[]) AND type = $2',
    [canonical, type],
  );
  return rows;
}

/** 태그 하나의 tag_id. DB 에 없으면 오류 (db/schema.sql 시드·migration 을 먼저 적용해야 한다) */
async function requireTagId(db, name, type) {
  const [tag] = await findTags(db, [name], type);
  if (!tag) throw new Error(`태그 '${name}'(${type})가 DB에 없습니다. db/migrate-tag-master-constraint.sql 을 먼저 적용하세요.`);
  return tag.tag_id;
}

/**
 * 반려동물 동반 가능 크기(TourAPI acmpyPsblCpam 등) → 크기 태그.
 * IMPORTANT: '맹견 및 대형견 제외'에 '대형견'이 들어 있다고 #대형견 동반을 붙이면 안 되고,
 * 가장 흔한 표현인 '전 견종 동반 가능'은 #대형견 동반이다.
 * @returns {'대형견 동반'|'소형견동반'|null}
 */
function petSizeTag(allowedSize = '') {
  const text = String(allowedSize || '').replace(/\s+/g, ' ');
  if (!text) return null;
  if (/(대형견|중\s?대형견)[^,.]{0,6}(제외|불가|금지)/.test(text)) return '소형견동반';
  // '이동장(켄넬)에 들어가는 전 견종', '안고 탑승'은 실제로 작은 개만 가능하다
  if (/이동장|켄넬|안고/.test(text)) return '소형견동반';
  if (/전\s?견종|모든\s?견종|견종\s?(제한\s?없|무관)|제한\s?없|대형견|모두/.test(text)) return '대형견 동반';
  if (/소형견|중형견/.test(text)) return '소형견동반';
  return null;
}

module.exports = { TAG_ALIASES, canonicalTagName, findTags, requireTagId, petSizeTag };
