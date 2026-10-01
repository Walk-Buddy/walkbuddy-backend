-- ============================================================
-- Migration: 장소 외부 번호 정리 + 중복 금지 제약
-- (migrate-spot-tour-enriched.sql 이후에 실행 — tour_content_id 컬럼 필요)
--
-- 예전엔 TourAPI 번호를 kakao_place_id 에 'tour_123'·'tour:123'·'tour_with_123' 형식으로 넣어
-- 같은 장소가 다시 들어와도 알아보지 못하고 중복 행이 생겼다.
--   1. 임시 형식의 TourAPI 번호를 tour_content_id 로 옮긴다
--   2. kakao_place_id 에는 실제 카카오 번호(숫자)만 남긴다
--   3. 같은 TourAPI 번호를 여러 행이 가지면 한 행에만 남긴다
--      (TourAPI 에서 만들어진 행 우선, 그다음 먼저 만든 행. 예: 소양강댐 ↔ K-water 소양강댐물문화관)
--   4. tour_content_id 중복 금지, kakao_place_id 숫자만 허용
-- 같은 장소가 이미 여러 행이면 이 migration 전에 합쳐야 한다 (scripts/merge-legacy-spots.js 등).
-- 여러 번 실행해도 안전하다.
-- ============================================================

BEGIN;

ALTER TABLE spots DROP CONSTRAINT IF EXISTS chk_spots_kakao_place_id;
DROP INDEX IF EXISTS uix_spots_tour_content_id;

CREATE TEMP TABLE spot_external_ids ON COMMIT DROP AS
SELECT spot_id,
       kakao_place_id ~ '^tour(_with)?[_:][0-9]+$' AS from_tour_api,
       COALESCE(tour_content_id, substring(kakao_place_id from '^tour(?:_with)?[_:]([0-9]+)$')) AS tc,
       created_at
FROM spots;

CREATE TEMP TABLE spot_external_ids_ranked ON COMMIT DROP AS
SELECT spot_id, tc,
       ROW_NUMBER() OVER (PARTITION BY tc ORDER BY from_tour_api DESC, created_at, spot_id) AS rn
FROM spot_external_ids;

UPDATE spots s
SET tour_content_id = CASE WHEN r.tc IS NOT NULL AND r.rn = 1 THEN r.tc END,
    kakao_place_id  = CASE WHEN s.kakao_place_id ~ '^[0-9]+$' THEN s.kakao_place_id END
FROM spot_external_ids_ranked r
WHERE r.spot_id = s.spot_id
  AND (s.tour_content_id IS DISTINCT FROM CASE WHEN r.tc IS NOT NULL AND r.rn = 1 THEN r.tc END
       OR s.kakao_place_id IS DISTINCT FROM CASE WHEN s.kakao_place_id ~ '^[0-9]+$' THEN s.kakao_place_id END);

CREATE UNIQUE INDEX uix_spots_tour_content_id ON spots (tour_content_id) WHERE tour_content_id IS NOT NULL;
ALTER TABLE spots ADD CONSTRAINT chk_spots_kakao_place_id
  CHECK (kakao_place_id IS NULL OR kakao_place_id ~ '^[0-9]+$');

COMMIT;
