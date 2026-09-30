-- db/migrate-bomnaegil-tag.sql
-- 1. '춘천 봄내길' 태그 등록 (is_review_tag = FALSE)
INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES ('춘천 봄내길', 'course', '추천·종류', true, false)
ON CONFLICT (name, type) DO UPDATE
SET group_name = EXCLUDED.group_name,
    is_active = TRUE,
    is_review_tag = FALSE;

-- 2. 이름에 '봄내길'이 포함된 모든 코스에 '춘천 봄내길' 태그 연결
INSERT INTO taggings (tag_id, target_id, target_type, user_id)
SELECT
  t.tag_id,
  c.course_id,
  'course',
  '00000000-0000-4000-8000-000000000001'::uuid
FROM courses c
CROSS JOIN tags t
WHERE t.name = '춘천 봄내길'
  AND t.type = 'course'
  AND c.name LIKE '%봄내길%'
ON CONFLICT DO NOTHING;
