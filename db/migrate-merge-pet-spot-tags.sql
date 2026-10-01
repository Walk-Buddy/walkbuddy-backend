-- ============================================================
-- Migration: 같은 뜻의 반려동물 장소 태그 합치기
--   - 반려견동반 → 반려동물
--   - 대형견가능 → 대형견 동반
-- 정본은 db/schema.sql 의 반려동물 그룹 태그(반려동물·대형견 동반)다.
-- 예전 시드(migrate-tag-overhaul-final.sql)가 만든 옛 이름에 붙은 태그를 정본으로 옮기고 옛 태그는 지운다.
-- 사용자 선호 태그(users.pref_tag_ids)도 정본 tag_id 로 바꾼다. 여러 번 실행해도 안전하다.
-- ============================================================

BEGIN;

-- 정본 태그가 없으면 만든다 (schema.sql 과 같은 값)
INSERT INTO tags (name, type, group_name, is_active, is_review_tag) VALUES
  ('반려동물',    'spot', '반려동물', TRUE, FALSE),
  ('대형견 동반', 'spot', '반려동물', TRUE, FALSE)
ON CONFLICT (name, type) DO UPDATE SET group_name = '반려동물', is_active = TRUE;

CREATE TEMP TABLE pet_tag_merge ON COMMIT DROP AS
SELECT old_t.tag_id AS old_id, new_t.tag_id AS new_id
FROM (VALUES ('반려견동반', '반려동물'), ('대형견가능', '대형견 동반')) AS m(old_name, new_name)
JOIN tags old_t ON old_t.name = m.old_name AND old_t.type = 'spot'
JOIN tags new_t ON new_t.name = m.new_name AND new_t.type = 'spot';

INSERT INTO taggings (tag_id, target_id, target_type, user_id)
SELECT m.new_id, g.target_id, g.target_type, g.user_id
FROM taggings g JOIN pet_tag_merge m ON g.tag_id = m.old_id
ON CONFLICT DO NOTHING;

UPDATE users u
SET pref_tag_ids = (
  SELECT jsonb_agg(DISTINCT to_jsonb(COALESCE(m.new_id::text, e.value)))
  FROM jsonb_array_elements_text(u.pref_tag_ids) AS e(value)
  LEFT JOIN pet_tag_merge m ON m.old_id::text = e.value
)
WHERE jsonb_typeof(u.pref_tag_ids) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(u.pref_tag_ids) AS e(value)
    JOIN pet_tag_merge m ON m.old_id::text = e.value
  );

-- taggings 는 ON DELETE CASCADE 로 함께 지워진다
DELETE FROM tags WHERE tag_id IN (SELECT old_id FROM pet_tag_merge);

COMMIT;
