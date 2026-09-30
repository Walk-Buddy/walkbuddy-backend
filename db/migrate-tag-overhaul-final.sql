-- ================================================
-- Migration: 태그 체계 최종 개편 (산책로·장소 분류, 후기 권한 및 정합성 보장)
-- ================================================

-- 1. tags 테이블에 group_name 및 후기 등록 가능 여부 컬럼 추가
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_name VARCHAR(50) NOT NULL DEFAULT '기타';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_review_tag BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS ix_tags_type_group ON tags (type, group_name);

-- 2. 신규 표준 코스 태그 등록 및 그룹/후기권한 설정
INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES
  -- 코스 출처 (시스템 전용, 후기 불가)
  ('공식코스', 'course', '코스 출처', TRUE, FALSE),
  ('사용자코스', 'course', '코스 출처', TRUE, FALSE),

  -- 추천·종류 (후기 불가: 추천코스는 시스템/에디터 추천으로 전환)
  ('추천코스', 'course', '추천·종류', TRUE, FALSE),
  ('관광코스', 'course', '추천·종류', TRUE, FALSE),
  ('둘레길', 'course', '추천·종류', TRUE, FALSE),

  -- 분위기 (후기 등록 가능)
  ('힐링', 'course', '분위기', TRUE, TRUE),
  ('노을·야경', 'course', '분위기', TRUE, TRUE),
  ('자연·풍경', 'course', '분위기', TRUE, TRUE),
  ('역사·문화', 'course', '분위기', TRUE, TRUE),

  -- 동반·접근성 (무장애길은 안전 공인 전용, 반려동물/아이와함께는 후기 가능)
  ('무장애길', 'course', '동반·접근성', TRUE, FALSE),
  ('반려동물', 'course', '동반·접근성', TRUE, TRUE),
  ('아이와함께', 'course', '동반·접근성', TRUE, TRUE)
ON CONFLICT (name, type) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  is_active = EXCLUDED.is_active,
  is_review_tag = EXCLUDED.is_review_tag;

-- 3. 신규 표준 스팟 태그 등록 및 그룹/후기권한 설정
INSERT INTO tags (name, type, group_name, is_active, is_review_tag)
VALUES
  -- 열린관광 (무장애 편의시설)
  ('열린관광', 'spot', '열린관광', TRUE, FALSE), -- 인증 대표 태그 (후기 불가)
  ('무단차통로', 'spot', '열린관광', TRUE, TRUE),
  ('휠체어접근', 'spot', '열린관광', TRUE, TRUE),
  ('휠체어대여', 'spot', '열린관광', TRUE, TRUE),
  ('장애인주차', 'spot', '열린관광', TRUE, TRUE),
  ('장애인화장실', 'spot', '열린관광', TRUE, TRUE),
  ('엘리베이터', 'spot', '열린관광', TRUE, TRUE),
  ('안내견동반', 'spot', '열린관광', TRUE, TRUE),
  ('시각장애인음성안내', 'spot', '열린관광', TRUE, FALSE), -- 전문 시설 (후기 불가)
  ('점자안내', 'spot', '열린관광', TRUE, TRUE),
  ('수어안내', 'spot', '열린관광', TRUE, TRUE),
  ('유모차대여', 'spot', '열린관광', TRUE, TRUE),
  ('수유실', 'spot', '열린관광', TRUE, TRUE),

  -- 반려동물
  ('반려견동반', 'spot', '반려동물', TRUE, TRUE),
  ('소형견동반', 'spot', '반려동물', TRUE, TRUE),
  ('대형견가능', 'spot', '반려동물', TRUE, TRUE),
  ('반려견배변시설', 'spot', '반려동물', TRUE, TRUE),
  ('반려견놀이터', 'spot', '반려동물', TRUE, TRUE),

  -- 시설·편의
  ('화장실', 'spot', '시설·편의', TRUE, TRUE),
  ('주차가능', 'spot', '시설·편의', TRUE, TRUE),
  ('식수대', 'spot', '시설·편의', TRUE, TRUE),
  ('벤치·쉼터', 'spot', '시설·편의', TRUE, TRUE),
  ('카페&식당', 'spot', '시설·편의', TRUE, TRUE),

  -- 분위기·테마
  ('Odii음성해설', 'spot', '분위기·테마', TRUE, FALSE), -- Odii 연동 전용 (후기 불가)
  ('포토존', 'spot', '분위기·테마', TRUE, TRUE),
  ('전통·한옥', 'spot', '분위기·테마', TRUE, TRUE),
  ('낮그늘', 'spot', '분위기·테마', TRUE, TRUE),
  ('야경명소', 'spot', '분위기·테마', TRUE, TRUE),
  ('실시간축제', 'spot', '분위기·테마', TRUE, FALSE) -- 실시간 연동 전용 (후기 불가)
ON CONFLICT (name, type) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  is_active = EXCLUDED.is_active,
  is_review_tag = EXCLUDED.is_review_tag;

-- 4. 구 태그 매핑 및 taggings 이전 함수/블록
DO $$
DECLARE
  v_rec RECORD;
  v_target_tag_id UUID;
  v_old_tag_id UUID;
BEGIN
  -- (구태그 이름, 타입, 신규 표준 태그 이름) 매핑 배열 순회
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('추천산책로', 'course', '추천코스'),
      ('배리어프리(무장애길)', 'course', '무장애길'),
      ('휠체어가능', 'course', '무장애길'),
      ('어린이', 'course', '아이와함께'),
      ('유아차가능', 'course', '아이와함께'),
      ('음성해설', 'spot', 'Odii음성해설'),
      ('장애인 화장실', 'spot', '장애인화장실'),
      ('장애인 주차구역', 'spot', '장애인주차'),
      ('주출입구 진입로', 'spot', '무단차통로'),
      ('휠체어 대여', 'spot', '휠체어대여'),
      ('도우미견가능', 'spot', '안내견동반'),
      ('안내견 동반', 'spot', '안내견동반'),
      ('점자 안내', 'spot', '점자안내'),
      ('수어 안내', 'spot', '수어안내'),
      ('유모차 대여', 'spot', '유모차대여'),
      ('벤치&휴게소', 'spot', '벤치·쉼터'),
      ('한옥&전통적', 'spot', '전통·한옥'),
      ('주차', 'spot', '주차가능')
    ) AS t(old_name, t_type, new_name)
  LOOP
    SELECT tag_id INTO v_target_tag_id FROM tags WHERE name = v_rec.new_name AND type = v_rec.t_type LIMIT 1;
    SELECT tag_id INTO v_old_tag_id FROM tags WHERE name = v_rec.old_name AND type = v_rec.t_type LIMIT 1;

    IF v_target_tag_id IS NOT NULL AND v_old_tag_id IS NOT NULL THEN
      -- 기존 taggings 를 신규 표준 태그로 업데이트 (중복 충돌 방지)
      UPDATE taggings
      SET tag_id = v_target_tag_id
      WHERE tag_id = v_old_tag_id
        AND NOT EXISTS (
          SELECT 1 FROM taggings t2
          WHERE t2.tag_id = v_target_tag_id
            AND t2.target_id = taggings.target_id
            AND t2.target_type = taggings.target_type
            AND t2.user_id = taggings.user_id
        );

      -- 미이전 잔여 중복 삭제 후 구 태그 비활성화
      DELETE FROM taggings WHERE tag_id = v_old_tag_id;
      UPDATE tags SET is_active = FALSE WHERE tag_id = v_old_tag_id;
    END IF;
  END LOOP;
END $$;
