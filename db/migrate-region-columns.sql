-- ============================================================
-- Migration: Add region & sub_region columns to spots and courses
-- ============================================================

-- 1. spots 테이블 컬럼 추가
ALTER TABLE spots ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT '서울';
ALTER TABLE spots ADD COLUMN IF NOT EXISTS sub_region VARCHAR(50) NULL;

-- 2. courses 테이블 컬럼 추가
ALTER TABLE courses ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT '서울';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS sub_region VARCHAR(50) NULL;

-- 3. spots 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS ix_spots_region ON spots (region, sub_region);

-- 4. courses 테이블 인덱스 생성
CREATE INDEX IF NOT EXISTS ix_courses_region ON courses (region, sub_region);

-- 5. 기존 spots 데이터의 address/name 기반 region/sub_region 보정
-- 춘천 스팟
UPDATE spots
SET region = '춘천',
    sub_region = CASE
      WHEN address LIKE '%의암%' OR address LIKE '%공지천%' OR address LIKE '%삼천동%' OR address LIKE '%근화동%' OR address LIKE '%칠전동%' OR name LIKE '%공지천%' OR name LIKE '%의암%' THEN '의암호·공지천권'
      WHEN address LIKE '%소양%' OR address LIKE '%신북%' OR address LIKE '%우두%' OR address LIKE '%신사우%' OR name LIKE '%소양강%' THEN '소양강·신북권'
      WHEN address LIKE '%명동%' OR address LIKE '%효자%' OR address LIKE '%퇴계%' OR address LIKE '%석사%' OR address LIKE '%온의%' OR address LIKE '%중앙로%' THEN '도심·명동권'
      WHEN address LIKE '%구봉산%' OR address LIKE '%동면%' OR address LIKE '%만천%' OR address LIKE '%장학%' THEN '동면·구봉산권'
      WHEN address LIKE '%강촌%' OR address LIKE '%남산%' OR address LIKE '%남면%' OR address LIKE '%김유정%' OR address LIKE '%신동면%' THEN '강촌·남산권'
      ELSE '도심·명동권'
    END
WHERE address LIKE '%춘천%' OR name LIKE '%춘천%';

-- 서울 스팟 (자치구 추출)
UPDATE spots
SET region = '서울',
    sub_region = (
      SELECT gu FROM (
        VALUES
          ('강남구'), ('강동구'), ('강북구'), ('강서구'), ('관악구'),
          ('광진구'), ('구로구'), ('금천구'), ('노원구'), ('도봉구'),
          ('동대문구'), ('동작구'), ('마포구'), ('서대문구'), ('서초구'),
          ('성동구'), ('성북구'), ('송파구'), ('양천구'), ('영등포구'),
          ('용산구'), ('은평구'), ('종로구'), ('중구'), ('중랑구')
      ) AS districts(gu)
      WHERE spots.address LIKE '%' || gu || '%'
      LIMIT 1
    )
WHERE region = '서울' AND address IS NOT NULL AND sub_region IS NULL;

-- 6. 기존 courses 데이터의 name/description 기반 region/sub_region 보정
-- 춘천 코스
UPDATE courses
SET region = '춘천',
    sub_region = CASE
      WHEN name LIKE '%의암%' OR name LIKE '%공지천%' OR description LIKE '%공지천%' OR description LIKE '%의암%' THEN '의암호·공지천권'
      WHEN name LIKE '%소양%' OR name LIKE '%신북%' OR description LIKE '%소양강%' THEN '소양강·신북권'
      WHEN name LIKE '%명동%' OR name LIKE '%효자%' OR name LIKE '%석사%' THEN '도심·명동권'
      WHEN name LIKE '%구봉산%' OR name LIKE '%동면%' THEN '동면·구봉산권'
      WHEN name LIKE '%강촌%' OR name LIKE '%남산%' OR name LIKE '%김유정%' THEN '강촌·남산권'
      ELSE '도심·명동권'
    END
WHERE name LIKE '%춘천%' OR description LIKE '%춘천%';

-- 서울 코스 (자치구 추출)
UPDATE courses
SET region = '서울',
    sub_region = (
      SELECT gu FROM (
        VALUES
          ('강남구'), ('강동구'), ('강북구'), ('강서구'), ('관악구'),
          ('광진구'), ('구로구'), ('금천구'), ('노원구'), ('도봉구'),
          ('동대문구'), ('동작구'), ('마포구'), ('서대문구'), ('서초구'),
          ('성동구'), ('성북구'), ('송파구'), ('양천구'), ('영등포구'),
          ('용산구'), ('은평구'), ('종로구'), ('중구'), ('중랑구')
      ) AS districts(gu)
      WHERE courses.name LIKE '%' || gu || '%' OR courses.description LIKE '%' || gu || '%'
      LIMIT 1
    )
WHERE region = '서울' AND sub_region IS NULL;
