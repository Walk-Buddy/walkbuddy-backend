-- ================================================
-- Migration: 한국관광공사 TourAPI 4.0 연동 및 카테고리/태그 개편 (안전 버전)
-- ================================================

-- 1. courses 테이블 컬럼 추가
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_cycle BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS difficulty_level SMALLINT NOT NULL DEFAULT 1;

-- 2. spots 테이블 컬럼 추가
ALTER TABLE spots ADD COLUMN IF NOT EXISTS barrier_free_info JSONB NULL;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS is_night_tour BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. tags 테이블 group_name 컬럼 추가
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_name VARCHAR(30) NOT NULL DEFAULT '기타';
CREATE INDEX IF NOT EXISTS ix_tags_type_group ON tags (type, group_name);

-- 4. 태그 테이블 안전 정비: 음성해설 태그 생성 및 기존 해설 태그 연결 이전
DO $$
DECLARE
    voice_tag_id UUID;
BEGIN
    -- 음성해설 태그 확인 또는 생성
    SELECT tag_id INTO voice_tag_id FROM tags WHERE name = '음성해설' AND type = 'spot';
    IF voice_tag_id IS NULL THEN
        INSERT INTO tags (tag_id, name, type, group_name, is_active)
        VALUES (gen_random_uuid(), '음성해설', 'spot', '해설·안내', TRUE)
        RETURNING tag_id INTO voice_tag_id;
    END IF;

    -- 기존 역사해설/관광해설 taggings를 음성해설로 이전
    UPDATE taggings
    SET tag_id = voice_tag_id
    WHERE tag_id IN (
        SELECT tag_id FROM tags WHERE name IN ('역사해설', '관광해설') AND type = 'spot'
    )
    AND NOT EXISTS (
        SELECT 1 FROM taggings t2 
        WHERE t2.target_id = taggings.target_id 
          AND t2.target_type = taggings.target_type 
          AND t2.user_id = taggings.user_id 
          AND t2.tag_id = voice_tag_id
    );

    -- 기존 역사해설/관광해설 태그 비활성화 또는 삭제
    DELETE FROM taggings WHERE tag_id IN (SELECT tag_id FROM tags WHERE name IN ('역사해설', '관광해설') AND type = 'spot');
    DELETE FROM tags WHERE name IN ('역사해설', '관광해설') AND type = 'spot';
END $$;

-- 5. 신규 스팟 11대 태그 upsert
INSERT INTO tags (name, type, group_name, is_active)
VALUES
  ('음성해설', 'spot', '해설·안내', TRUE),
  ('열린관광', 'spot', '동반·접근성', TRUE),
  ('야간명소', 'spot', '분위기·테마', TRUE),
  ('포토존', 'spot', '분위기·테마', TRUE),
  ('전통·한옥', 'spot', '분위기·테마', TRUE),
  ('낮그늘', 'spot', '분위기·테마', TRUE),
  ('실시간축제', 'spot', '분위기·테마', TRUE),
  ('반려견동반', 'spot', '동반·접근성', TRUE),
  ('화장실', 'spot', '시설·편의', TRUE),
  ('주차가능', 'spot', '시설·편의', TRUE),
  ('벤치·쉼터', 'spot', '시설·편의', TRUE),
  ('벚꽃', 'spot', '분위기·테마', FALSE),
  ('단풍', 'spot', '분위기·테마', FALSE)
ON CONFLICT (name, type) DO UPDATE SET 
    group_name = EXCLUDED.group_name,
    is_active = EXCLUDED.is_active;

-- 6. 신규 코스 5대 태그 upsert
INSERT INTO tags (name, type, group_name, is_active)
VALUES
  ('추천코스', 'course', '추천·테마', TRUE),
  ('힐링', 'course', '추천·테마', TRUE),
  ('반려동물', 'course', '동반·접근성', TRUE),
  ('무장애길', 'course', '동반·접근성', TRUE),
  ('아이와함께', 'course', '동반·접근성', TRUE)
ON CONFLICT (name, type) DO UPDATE SET 
    group_name = EXCLUDED.group_name,
    is_active = EXCLUDED.is_active;
