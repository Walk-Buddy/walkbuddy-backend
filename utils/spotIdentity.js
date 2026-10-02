/**
 * utils/spotIdentity.js
 *
 * "같은 장소는 한 행" 원칙을 위한 공용 도구. 장소를 새로 넣기 전에 반드시 findExistingSpot 으로 확인한다.
 *
 *  - tour_content_id : 한국관광공사 TourAPI 콘텐츠 번호 (숫자 문자열, 중복 금지 — uix_spots_tour_content_id)
 *  - kakao_place_id  : 카카오 장소 번호 (숫자 문자열만, 중복 금지 — uix_spots_kakao_place_id, chk_spots_kakao_place_id)
 *
 * IMPORTANT: 예전엔 TourAPI 번호를 kakao_place_id 에 'tour_123'·'tour:123'·'tour_with_123' 형식으로 넣어서
 * 같은 장소가 들어올 때 알아보지 못하고 중복 행이 생겼다. (예: 육림랜드 3개)
 * 확인 순서: TourAPI 번호 → 카카오 번호 → (둘 다 못 찾으면) 같은 이름 + 1km 안.
 */
const { legacyContentId, normalizePlaceName } = require('./kakaoPlaceMatch');

// 이름이 완전히 같으면 공원·하천처럼 넓은 장소일 수 있어 1km 안을 같은 장소로 본다 (계남근린공원 TourAPI 두 건이 750m 차이)
const SAME_NAME_RADIUS_M = 1000;

/** 'tour_123', 'tour:123', 'tour_with_123', 123 → '123' */
function toTourContentId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return s;
  return legacyContentId(s);
}

/** 실제 카카오 장소 번호(숫자)만. 'tour_123' 같은 임시값은 null */
function toKakaoPlaceId(value) {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

const SPOT_COLUMNS = 'spot_id, name, status, tour_content_id, kakao_place_id';

/**
 * 이미 있는 장소 찾기 (상태와 무관하게 찾는다 — 숨긴 장소를 다시 만들지 않도록)
 * @param db pool 또는 트랜잭션 client
 * @returns {Promise<{spot_id, name, status, tour_content_id, kakao_place_id, matched_by}|null>}
 */
async function findExistingSpot(db, { tourContentId, kakaoPlaceId, name, lat, lng } = {}) {
  const tc = toTourContentId(tourContentId);
  if (tc) {
    const { rows } = await db.query(`SELECT ${SPOT_COLUMNS} FROM spots WHERE tour_content_id = $1`, [tc]);
    if (rows[0]) return { ...rows[0], matched_by: 'tour_content_id' };
  }

  const kp = toKakaoPlaceId(kakaoPlaceId);
  if (kp) {
    const { rows } = await db.query(`SELECT ${SPOT_COLUMNS} FROM spots WHERE kakao_place_id = $1`, [kp]);
    if (rows[0]) return { ...rows[0], matched_by: 'kakao_place_id' };
  }

  const wanted = normalizePlaceName(name);
  const la = Number(lat);
  const ln = Number(lng);
  if (wanted && Number.isFinite(la) && Number.isFinite(ln)) {
    const { rows } = await db.query(
      `SELECT ${SPOT_COLUMNS}, ST_Distance(location, ST_Point($1, $2)::GEOGRAPHY) AS distance
         FROM spots
        WHERE ST_DWithin(location, ST_Point($1, $2)::GEOGRAPHY, $3)
        ORDER BY distance`,
      [ln, la, SAME_NAME_RADIUS_M],
    );
    const same = rows.find((r) => normalizePlaceName(r.name) === wanted);
    if (same) {
      const { distance, ...spot } = same;
      return { ...spot, matched_by: 'name_distance' };
    }
  }
  return null;
}

/**
 * 찾은 장소에 비어 있는 외부 번호를 채운다. 다른 장소가 이미 쓰는 번호는 넣지 않는다.
 */
async function linkExternalIds(db, spotId, { tourContentId, kakaoPlaceId } = {}) {
  const tc = toTourContentId(tourContentId);
  if (tc) {
    await db.query(
      `UPDATE spots SET tour_content_id = $2
        WHERE spot_id = $1 AND tour_content_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM spots o WHERE o.tour_content_id = $2)`,
      [spotId, tc],
    );
  }
  const kp = toKakaoPlaceId(kakaoPlaceId);
  if (kp) {
    await db.query(
      `UPDATE spots SET kakao_place_id = $2
        WHERE spot_id = $1 AND kakao_place_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM spots o WHERE o.kakao_place_id = $2)`,
      [spotId, kp],
    );
  }
}

module.exports = { toTourContentId, toKakaoPlaceId, findExistingSpot, linkExternalIds, SAME_NAME_RADIUS_M };
