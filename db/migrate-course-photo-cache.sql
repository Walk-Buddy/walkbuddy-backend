-- ============================================================
-- Migration: 코스 관광사진 캐시
-- GET /api/courses/:id/photos 는 코스명·경유지마다 관광사진(TourAPI) 검색을 해서 수 초가 걸린다.
-- 결과를 코스에 저장해 사진이 있으면 7일, 없으면 1일 동안 재사용한다.
-- ============================================================

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS photo_cache JSONB NULL;

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS photo_cached_at TIMESTAMPTZ NULL;
