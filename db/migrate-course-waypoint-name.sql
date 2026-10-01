-- ============================================================
-- Migration: Add name column to course_waypoints
-- 카카오에 없는 옛터·표지석 등 좌표 핀 경유지에 표시 이름을 저장한다.
-- (예: 전국길관광정보 3.1운동길의 '손병희 집 터')
-- type = 'spot' 경유지는 spots.name 을 우선 사용한다.
-- ============================================================

ALTER TABLE course_waypoints
ADD COLUMN IF NOT EXISTS name VARCHAR(100) NULL;
