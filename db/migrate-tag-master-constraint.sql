-- ============================================================
-- Migration: 태그를 정본 목록으로 고정 (DB 제약)
--
-- 정본 = db/schema.sql 태그 시드. 이 migration 은
--   1. 정본 태그를 만들거나 그룹·후기 여부·활성 상태를 정본 값으로 맞추고
--   2. 같은 뜻의 옛 태그에 붙은 연결을 정본 태그로 옮긴 뒤
--   3. 정본에 없는 태그를 지우고 (연결은 ON DELETE CASCADE, 사용자 선호 태그에서도 뺀다)
--   4. chk_tags_master 제약으로 정본 외 태그가 다시 생기지 않게 막는다.
-- 예전에는 import 코드가 모르는 이름으로 태그를 자동 생성해 같은 뜻의 태그가 두 개씩 생겼다.
-- 태그를 추가·변경할 때는 schema.sql 의 시드와 제약, 그리고 새 migration 으로 제약을 함께 바꾼다.
-- 여러 번 실행해도 안전하다.
-- ============================================================

BEGIN;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS chk_tags_master;

-- 1. 정본 태그 (schema.sql 시드와 같음)
INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES
  -- 코스 출처 (시스템 전용, 후기 불가)
  ('공식코스',   'course', '코스 출처',  TRUE, FALSE),
  ('사용자코스', 'course', '코스 출처',  TRUE, FALSE),

  -- 추천·종류 (시스템/에디터 추천, 후기 불가)
  ('추천코스',   'course', '추천·종류',  TRUE, FALSE),
  ('둘레길',     'course', '추천·종류',  TRUE, FALSE),
  ('춘천 봄내길', 'course', '추천·종류',  TRUE, FALSE),

  -- 분위기 (후기 가능)
  ('힐링',       'course', '분위기',      TRUE, TRUE),
  ('노을·야경',  'course', '분위기',      TRUE, TRUE),
  ('자연·풍경',  'course', '분위기',      TRUE, TRUE),
  ('역사·문화',  'course', '분위기',      TRUE, TRUE),

  -- 동반·접근성 (무장애길은 인증 전용, 나머지는 후기 가능)
  ('무장애길',   'course', '동반·접근성', TRUE, FALSE),
  ('반려동물',   'course', '동반·접근성', TRUE, TRUE),
  ('아이와함께', 'course', '동반·접근성', TRUE, TRUE)
ON CONFLICT (name, type) DO UPDATE SET
  group_name    = EXCLUDED.group_name,
  is_active     = EXCLUDED.is_active,
  is_review_tag = EXCLUDED.is_review_tag;

-- 2. 표준 스팟 태그 (31개)
INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES
  -- 열린관광 (무장애 편의시설 12개 - 전부 후기 불가 FALSE)
  ('무단차통로',         'spot', '열린관광',     TRUE, FALSE),
  ('휠체어접근',         'spot', '열린관광',     TRUE, FALSE),
  ('휠체어대여',         'spot', '열린관광',     TRUE, FALSE),
  ('장애인주차',         'spot', '열린관광',     TRUE, FALSE),
  ('장애인화장실',       'spot', '열린관광',     TRUE, FALSE),
  ('엘리베이터',         'spot', '열린관광',     TRUE, FALSE),
  ('안내견동반',         'spot', '열린관광',     TRUE, FALSE),
  ('시각장애인음성안내', 'spot', '열린관광',     TRUE, FALSE),
  ('점자안내',           'spot', '열린관광',     TRUE, FALSE),
  ('수어안내',           'spot', '열린관광',     TRUE, FALSE),
  ('유모차대여',         'spot', '열린관광',     TRUE, FALSE),
  ('수유실',             'spot', '열린관광',     TRUE, FALSE),

  -- 반려동물 (한국관광공사 공인 데이터 - 전부 후기 불가 FALSE)
  ('반려동물',           'spot', '반려동물',     TRUE, FALSE),
  ('소형견동반',         'spot', '반려동물',     TRUE, FALSE),
  ('대형견 동반',        'spot', '반려동물',     TRUE, FALSE),
  ('반려견배변시설',     'spot', '반려동물',     TRUE, FALSE),
  ('반려견놀이터',       'spot', '반려동물',     TRUE, FALSE),

  -- 시설·편의 (후기 가능)
  ('화장실',             'spot', '시설·편의',    TRUE, TRUE),
  ('주차가능',           'spot', '시설·편의',    TRUE, TRUE),
  ('식수대',             'spot', '시설·편의',    TRUE, TRUE),
  ('벤치·쉼터',          'spot', '시설·편의',    TRUE, TRUE),

  -- 분위기·테마
  ('Odii음성해설',       'spot', '분위기·테마',  TRUE, FALSE), -- Odii 연동 전용 (후기 불가)
  ('실시간축제',         'spot', '분위기·테마',  TRUE, FALSE), -- 실시간 연동 전용 (후기 불가)
  ('포토존',             'spot', '분위기·테마',  TRUE, TRUE),
  ('전통·한옥',          'spot', '분위기·테마',  TRUE, TRUE),
  ('낮그늘',             'spot', '분위기·테마',  TRUE, TRUE),
  ('밤산책',             'spot', '분위기·테마',  TRUE, TRUE),   -- 야간명소 -> 밤산책 추천 대체
  ('일출명소',           'spot', '분위기·테마',  TRUE, TRUE),
  ('일몰명소',           'spot', '분위기·테마',  TRUE, TRUE),
  ('문화/예술',          'spot', '분위기·테마',  TRUE, TRUE),
  ('역사유적',           'spot', '분위기·테마',  TRUE, TRUE),
  ('벚꽃',               'spot', '분위기·테마',  FALSE, TRUE), -- 계절 태그 (봄 외 비활성)
  ('단풍',               'spot', '분위기·테마',  FALSE, TRUE)  -- 계절 태그 (가을 외 비활성)
ON CONFLICT (name, type) DO UPDATE SET
  group_name    = EXCLUDED.group_name,
  is_active     = EXCLUDED.is_active,
  is_review_tag = EXCLUDED.is_review_tag;

-- 2. 옛 이름 → 정본 이름 (정본 이름이 NULL 이면 연결도 지운다)
CREATE TEMP TABLE tag_merge ON COMMIT DROP AS
SELECT old_t.tag_id AS old_id, new_t.tag_id AS new_id
FROM tags old_t
LEFT JOIN (VALUES
  ('course', '관광코스',   '추천코스'),
  ('course', '추천산책로', '추천코스'),
  ('spot',   '반려견동반', '반려동물'),
  ('spot',   '대형견가능', '대형견 동반'),
  ('spot',   '야간명소',   '밤산책'),
  ('spot',   '야경명소',   '밤산책'),
  ('spot',   '야간개방',   '밤산책')
) AS m(type, old_name, new_name) ON m.type = old_t.type AND m.old_name = old_t.name
LEFT JOIN tags new_t ON new_t.type = m.type AND new_t.name = m.new_name
WHERE NOT ((old_t.type, old_t.group_name, old_t.name) IN (

    ('course', '코스 출처', '공식코스'),
    ('course', '코스 출처', '사용자코스'),
    ('course', '추천·종류', '추천코스'),
    ('course', '추천·종류', '둘레길'),
    ('course', '추천·종류', '춘천 봄내길'),
    ('course', '분위기', '힐링'),
    ('course', '분위기', '노을·야경'),
    ('course', '분위기', '자연·풍경'),
    ('course', '분위기', '역사·문화'),
    ('course', '동반·접근성', '무장애길'),
    ('course', '동반·접근성', '반려동물'),
    ('course', '동반·접근성', '아이와함께'),
    ('spot', '열린관광', '무단차통로'),
    ('spot', '열린관광', '휠체어접근'),
    ('spot', '열린관광', '휠체어대여'),
    ('spot', '열린관광', '장애인주차'),
    ('spot', '열린관광', '장애인화장실'),
    ('spot', '열린관광', '엘리베이터'),
    ('spot', '열린관광', '안내견동반'),
    ('spot', '열린관광', '시각장애인음성안내'),
    ('spot', '열린관광', '점자안내'),
    ('spot', '열린관광', '수어안내'),
    ('spot', '열린관광', '유모차대여'),
    ('spot', '열린관광', '수유실'),
    ('spot', '반려동물', '반려동물'),
    ('spot', '반려동물', '소형견동반'),
    ('spot', '반려동물', '대형견 동반'),
    ('spot', '반려동물', '반려견배변시설'),
    ('spot', '반려동물', '반려견놀이터'),
    ('spot', '시설·편의', '화장실'),
    ('spot', '시설·편의', '주차가능'),
    ('spot', '시설·편의', '식수대'),
    ('spot', '시설·편의', '벤치·쉼터'),
    ('spot', '분위기·테마', 'Odii음성해설'),
    ('spot', '분위기·테마', '실시간축제'),
    ('spot', '분위기·테마', '포토존'),
    ('spot', '분위기·테마', '전통·한옥'),
    ('spot', '분위기·테마', '낮그늘'),
    ('spot', '분위기·테마', '밤산책'),
    ('spot', '분위기·테마', '일출명소'),
    ('spot', '분위기·테마', '일몰명소'),
    ('spot', '분위기·테마', '문화/예술'),
    ('spot', '분위기·테마', '역사유적'),
    ('spot', '분위기·테마', '벚꽃'),
    ('spot', '분위기·테마', '단풍')
));

INSERT INTO taggings (tag_id, target_id, target_type, user_id)
SELECT m.new_id, g.target_id, g.target_type, g.user_id
FROM taggings g JOIN tag_merge m ON g.tag_id = m.old_id
WHERE m.new_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE users u
SET pref_tag_ids = COALESCE((
  SELECT jsonb_agg(DISTINCT to_jsonb(COALESCE(m.new_id::text, e.value)))
  FROM jsonb_array_elements_text(u.pref_tag_ids) AS e(value)
  LEFT JOIN tag_merge m ON m.old_id::text = e.value
  WHERE m.old_id IS NULL OR m.new_id IS NOT NULL
), '[]'::jsonb)
WHERE jsonb_typeof(u.pref_tag_ids) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(u.pref_tag_ids) AS e(value)
    JOIN tag_merge m ON m.old_id::text = e.value
  );

-- 3. 정본 외 태그 삭제 (taggings 는 함께 지워진다)
DELETE FROM tags WHERE tag_id IN (SELECT old_id FROM tag_merge);

-- 4. 정본 외 태그 차단
ALTER TABLE tags ADD CONSTRAINT chk_tags_master CHECK (
  (type, group_name, name) IN (
    ('course', '코스 출처', '공식코스'),
    ('course', '코스 출처', '사용자코스'),
    ('course', '추천·종류', '추천코스'),
    ('course', '추천·종류', '둘레길'),
    ('course', '추천·종류', '춘천 봄내길'),
    ('course', '분위기', '힐링'),
    ('course', '분위기', '노을·야경'),
    ('course', '분위기', '자연·풍경'),
    ('course', '분위기', '역사·문화'),
    ('course', '동반·접근성', '무장애길'),
    ('course', '동반·접근성', '반려동물'),
    ('course', '동반·접근성', '아이와함께'),
    ('spot', '열린관광', '무단차통로'),
    ('spot', '열린관광', '휠체어접근'),
    ('spot', '열린관광', '휠체어대여'),
    ('spot', '열린관광', '장애인주차'),
    ('spot', '열린관광', '장애인화장실'),
    ('spot', '열린관광', '엘리베이터'),
    ('spot', '열린관광', '안내견동반'),
    ('spot', '열린관광', '시각장애인음성안내'),
    ('spot', '열린관광', '점자안내'),
    ('spot', '열린관광', '수어안내'),
    ('spot', '열린관광', '유모차대여'),
    ('spot', '열린관광', '수유실'),
    ('spot', '반려동물', '반려동물'),
    ('spot', '반려동물', '소형견동반'),
    ('spot', '반려동물', '대형견 동반'),
    ('spot', '반려동물', '반려견배변시설'),
    ('spot', '반려동물', '반려견놀이터'),
    ('spot', '시설·편의', '화장실'),
    ('spot', '시설·편의', '주차가능'),
    ('spot', '시설·편의', '식수대'),
    ('spot', '시설·편의', '벤치·쉼터'),
    ('spot', '분위기·테마', 'Odii음성해설'),
    ('spot', '분위기·테마', '실시간축제'),
    ('spot', '분위기·테마', '포토존'),
    ('spot', '분위기·테마', '전통·한옥'),
    ('spot', '분위기·테마', '낮그늘'),
    ('spot', '분위기·테마', '밤산책'),
    ('spot', '분위기·테마', '일출명소'),
    ('spot', '분위기·테마', '일몰명소'),
    ('spot', '분위기·테마', '문화/예술'),
    ('spot', '분위기·테마', '역사유적'),
    ('spot', '분위기·테마', '벚꽃'),
    ('spot', '분위기·테마', '단풍')
  )
);

COMMIT;
