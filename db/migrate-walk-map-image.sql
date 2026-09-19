-- ============================================================
-- Migration: Add map_image_url column to walk_records
-- 자유 산책 및 코스 산책 완료 시 앱에서 캡처한 지도 이미지 URL 저장용
-- ============================================================

ALTER TABLE walk_records 
ADD COLUMN IF NOT EXISTS map_image_url VARCHAR(500) NULL;
