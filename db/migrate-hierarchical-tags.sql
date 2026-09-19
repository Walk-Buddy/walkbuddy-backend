-- 계층형 세부 태그 추가 마이그레이션
-- 열린관광(무장애), 반려동물 동반, 시설·편의, 분위기·테마 그룹화

ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_name VARCHAR(50) NOT NULL DEFAULT '기타';
CREATE INDEX IF NOT EXISTS ix_tags_type_group ON tags (type, group_name);

INSERT INTO tags (name, type, group_name, is_active)
VALUES
  -- 1. 열린관광 (무장애) 세부 태그
  ('열린관광', 'spot', '열린관광', TRUE),
  ('휠체어접근', 'spot', '열린관광', TRUE),
  ('무단차통로', 'spot', '열린관광', TRUE),
  ('장애인화장실', 'spot', '열린관광', TRUE),
  ('장애인주차', 'spot', '열린관광', TRUE),
  ('엘리베이터', 'spot', '열린관광', TRUE),
  ('유모차대여', 'spot', '열린관광', TRUE),
  ('수유실', 'spot', '열린관광', TRUE),
  ('점자안내', 'spot', '열린관광', TRUE),
  ('도우미견가능', 'spot', '열린관광', TRUE),
  ('수어안내', 'spot', '열린관광', TRUE),

  -- 2. 반려동물 동반 세부 태그
  ('반려견동반', 'spot', '반려동물', TRUE),
  ('대형견가능', 'spot', '반려동물', TRUE),
  ('소형견동반', 'spot', '반려동물', TRUE),
  ('반려견배변시설', 'spot', '반려동물', TRUE),
  ('반려견놀이터', 'spot', '반려동물', TRUE),

  -- 3. 시설·편의 세부 태그
  ('화장실', 'spot', '시설·편의', TRUE),
  ('주차가능', 'spot', '시설·편의', TRUE),
  ('벤치·쉼터', 'spot', '시설·편의', TRUE),

  -- 4. 분위기·테마 세부 태그
  ('음성해설', 'spot', '분위기·테마', TRUE),
  ('포토존', 'spot', '분위기·테마', TRUE),
  ('전통·한옥', 'spot', '분위기·테마', TRUE),
  ('낮그늘', 'spot', '분위기·테마', TRUE),
  ('야간명소', 'spot', '분위기·테마', TRUE),
  ('실시간축제', 'spot', '분위기·테마', TRUE)
ON CONFLICT (name, type) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  is_active = EXCLUDED.is_active;
