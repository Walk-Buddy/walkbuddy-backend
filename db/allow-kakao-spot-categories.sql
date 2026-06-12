-- 앱 기준 카테고리로 매핑되지 않는 카카오 장소도 저장할 수 있도록
-- 고정 카테고리 목록 CHECK 제약을 제거한다.
ALTER TABLE spots
DROP CONSTRAINT IF EXISTS chk_spots_categories;
