-- ============================================================
-- Migration: 후기 작성 화면 태그 정리
-- 장소 후기 '기타' 그룹의 중복·잘못 분류된 태그를 정리한다.
--   - 밤산책        → 분위기·테마 그룹으로 이동
--   - 대형견 동반·반려동물(spot) → 관광공사 공인 데이터 태그라 후기 선택 목록에서 제외
--     (같은 뜻의 대형견가능·반려견동반은 migrate-merge-pet-spot-tags.sql 에서 합쳤다)
-- 이미 장소에 붙은 태그(taggings)는 그대로 남는다. (is_review_tag 만 변경)
-- ============================================================

UPDATE tags SET group_name = '분위기·테마'
WHERE type = 'spot' AND name = '밤산책';

UPDATE tags SET is_review_tag = FALSE
WHERE type = 'spot' AND name IN ('대형견 동반', '반려동물');
