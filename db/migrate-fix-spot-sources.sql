-- db/migrate-fix-spot-sources.sql
-- 한국관광공사 콘텐츠(투어 개요, 오디오 가이드, 배리어프리 정보)가 연동되어 있거나
-- 시드 데이터로 구축된 스팟의 source 를 'admin' 으로 승격하여
-- 장소 검색 및 태그 필터에서 정상 노출되도록 보장합니다.

UPDATE spots
SET source = 'admin'
WHERE source = 'kakao'
  AND (
    barrier_free_info IS NOT NULL
    OR content_tour IS NOT NULL
    OR spot_id::text LIKE '20000000-%'
  );
