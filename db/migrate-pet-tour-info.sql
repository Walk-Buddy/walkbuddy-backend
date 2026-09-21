-- spots 테이블에 한국관광공사 반려동물 동반여행(KorPetTourService2) 상세 정보 컬럼 추가
ALTER TABLE spots ADD COLUMN IF NOT EXISTS pet_tour_info JSONB NULL;

-- GIN 인덱스 (JSONB 내부 필드 검색 최적화)
CREATE INDEX IF NOT EXISTS ix_spots_pet_tour_info ON spots USING GIN (pet_tour_info);
