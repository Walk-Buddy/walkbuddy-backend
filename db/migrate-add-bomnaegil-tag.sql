-- ================================================
-- Migration: 춘천 봄내길 태그 추가
-- 프론트 DEFAULT_COURSE_TAGS_BY_GROUP에는 이미 포함되어 있지만
-- 서버 /api/tags 로드 시 DB에 없으면 visible() 필터에 의해 숨겨지므로
-- DB에도 동일하게 등록한다.
-- ================================================

INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES
  ('춘천 봄내길', 'course', '추천·종류', TRUE, FALSE)
ON CONFLICT (name, type) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  is_active = EXCLUDED.is_active,
  is_review_tag = EXCLUDED.is_review_tag;
