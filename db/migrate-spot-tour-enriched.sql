-- ============================================================
-- Migration: Add TourAPI enrichment markers to spots
-- 스팟 저장 시 TourAPI(개요·무장애·반려동물)·Odii 보강을 반복 호출하지 않기 위한 기록.
--
--   tour_enriched_at : 마지막으로 보강을 마친 시각 (일일 한도 초과로 실패하면 기록 안 함)
--                      TOUR_ENRICH_REFRESH_DAYS(기본 30일) 안이면 재저장 시 보강 생략
--   tour_content_id  : 매칭된 TourAPI contentId (TourAPI에 없는 장소면 NULL)
--                      다시 보강할 때 위치·키워드 매칭 검색을 생략하는 데 사용
-- ============================================================

ALTER TABLE spots
ADD COLUMN IF NOT EXISTS tour_enriched_at TIMESTAMPTZ NULL;

ALTER TABLE spots
ADD COLUMN IF NOT EXISTS tour_content_id VARCHAR(20) NULL;
