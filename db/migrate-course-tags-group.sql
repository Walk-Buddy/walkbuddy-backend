-- 코스 및 스팟 태그 그룹 정비 및 무장애 편의시설 세부 태그 추가 마이그레이션

-- 1. 산책로(코스) 태그 그룹 정상화
UPDATE tags SET group_name = '추천·테마' WHERE type = 'course' AND name IN ('추천산책로', '힐링', '둘레길', '추천코스', '관광코스');
UPDATE tags SET group_name = '동반·접근성' WHERE type = 'course' AND name IN ('무장애길', '배리어프리(무장애길)', '유아차가능', '휠체어가능', '반려동물', '어린이', '아이와함께');

-- 2. 장소(스팟) 기타 태그 그룹 정상화
UPDATE tags SET group_name = '시설·편의' WHERE type = 'spot' AND name IN ('카페&식당', '벤치&휴게소', '식수대', '주차', '화장실', '주차가능', '벤치·쉼터');
UPDATE tags SET group_name = '분위기·테마' WHERE type = 'spot' AND name IN ('역사유적', '한옥&전통적', '야경명소', '일출명소', '일몰명소', '야간개방', '문화/예술', '벚꽃', '단풍', '음성해설', '포토존', '전통·한옥', '낮그늘', '실시간축제');

-- 3. 열린관광(무장애) 편의시설 세부 태그 추가 및 보강
INSERT INTO tags (name, type, group_name, is_active)
VALUES
  ('열린관광', 'spot', '열린관광', TRUE),
  ('장애인 주차구역', 'spot', '열린관광', TRUE),
  ('장애인주차', 'spot', '열린관광', TRUE),
  ('주출입구 진입로', 'spot', '열린관광', TRUE),
  ('무단차통로', 'spot', '열린관광', TRUE),
  ('안내견 동반', 'spot', '열린관광', TRUE),
  ('도우미견가능', 'spot', '열린관광', TRUE),
  ('휠체어 대여', 'spot', '열린관광', TRUE),
  ('휠체어접근', 'spot', '열린관광', TRUE),
  ('장애인 화장실', 'spot', '열린관광', TRUE),
  ('장애인화장실', 'spot', '열린관광', TRUE),
  ('엘리베이터', 'spot', '열린관광', TRUE),
  ('유모차 대여', 'spot', '열린관광', TRUE),
  ('유모차대여', 'spot', '열린관광', TRUE),
  ('수유실', 'spot', '열린관광', TRUE),
  ('점자 안내', 'spot', '열린관광', TRUE),
  ('점자안내', 'spot', '열린관광', TRUE),
  ('수어 안내', 'spot', '열린관광', TRUE),
  ('수어안내', 'spot', '열린관광', TRUE)
ON CONFLICT (name, type) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  is_active = EXCLUDED.is_active;
