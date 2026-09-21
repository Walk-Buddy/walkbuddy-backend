-- ============================================================
-- Migration: Add first_image column to spots
-- 장소 목록 카드에 노출할 대표 사진(한국관광공사 TourAPI firstimage) 저장용.
--
-- 노출 우선순위(프론트 처리):
--   1) first_image        : 한국관광공사 TourAPI 대표 이미지
--   2) review_photo_url   : 후기 사진(spot_reviews.photos) 폴백
-- ============================================================

ALTER TABLE spots
ADD COLUMN IF NOT EXISTS first_image TEXT NULL;
