-- ================================================
-- Migration: spots.source 체크 제약에 'tour' 허용 추가
-- ------------------------------------------------------------
-- 배경:
--   aiContentService.js 가 TourAPI contentId 기반으로 스팟을 신규 등록할 때
--   source = 'tour' 로 INSERT 한다.
--   그러나 chk_spots_source 제약이 ('admin','kakao') 만 허용하여
--   "violates check constraint chk_spots_source" 오류가 발생했다.
--
-- 조치:
--   기존 제약을 드롭하고 'admin','kakao','tour' 를 허용하도록 재생성한다.
--   (schema.sql 도 동일하게 수정되어 신규 초기화 시에도 반영된다.)
-- ================================================

ALTER TABLE spots DROP CONSTRAINT IF EXISTS chk_spots_source;

ALTER TABLE spots
  ADD CONSTRAINT chk_spots_source
  CHECK (source IN ('admin', 'kakao', 'tour'));
