-- ======================================================================
-- 마이그레이션: 후기 삭제 후 재작성 허용을 위한 Partial Unique Index 적용
-- 
-- 1. course_reviews: 기존 uq_course_reviews_walk_record 제약 제거
--    -> status = 'active' 상태에 대해서만 중복을 방지하는 부분 유니크 인덱스 생성
-- 2. spot_reviews: 기존 uq_spot_reviews_walk_spot 제약 제거
--    -> status = 'active' 상태에 대해서만 중복을 방지하는 부분 유니크 인덱스 생성
-- ======================================================================

-- 1. 코스 후기 (course_reviews)
ALTER TABLE course_reviews DROP CONSTRAINT IF EXISTS uq_course_reviews_walk_record;
DROP INDEX IF EXISTS uq_course_reviews_walk_record_active;
CREATE UNIQUE INDEX uq_course_reviews_walk_record_active
    ON course_reviews (walk_record_id)
    WHERE status = 'active';

-- 2. 스팟 후기 (spot_reviews)
ALTER TABLE spot_reviews DROP CONSTRAINT IF EXISTS uq_spot_reviews_walk_spot;
DROP INDEX IF EXISTS uq_spot_reviews_walk_spot_active;
CREATE UNIQUE INDEX uq_spot_reviews_walk_spot_active
    ON spot_reviews (walk_record_id, spot_id)
    WHERE status = 'active';
