-- ================================================
-- DB 스키마 설계서
-- 서비스: 산책 코스 추천 앱
-- DB: PostgreSQL
-- 작성 기준: 기능명세서 v1
-- ================================================


-- ================================================
-- PostGIS 확장 활성화
-- 위치 기반 검색·거리 계산·공간 인덱스 지원
-- ================================================
CREATE EXTENSION IF NOT EXISTS postgis;


-- ================================================
-- 공통 함수: updated_at 자동 갱신
-- 모든 테이블의 UPDATE 트리거에서 재사용
-- ================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ================================================
-- TABLE: users
-- 서비스의 모든 회원 정보 저장
-- 일반 로그인 + 소셜(카카오) 로그인 통합 관리
-- pref_conditions(난이도·거리·시간) + pref_tag_ids(선호 태그) 를 별도 테이블 없이 통합
--
-- [이메일 인증 흐름]
-- 1. 사용자가 이메일 입력 + 중복 확인 + 인증 코드 발송 요청
-- 2. 서버: 6자리 코드 생성, JWT(payload: email, code, exp 3분)로 서버 보관
-- 3. 코드만 이메일 발송, users INSERT 는 아직 없음
-- 4. 사용자 코드 입력 → 서버에서 JWT 검증
-- 5. 비밀번호·닉네임·선호 입력 완료 후 회원가입 완료 버튼
-- 6. users INSERT (status = 'active' 로 즉시 활성화)
-- → 이메일 인증이 INSERT 전에 끝나므로 users 테이블에
--   email_verify 관련 컬럼·pending 상태 불필요
--
-- [카카오 로그인 흐름]
-- 1. 카카오 OAuth 로그인 → social_id 받음
-- 2. users 에서 (social_provider='kakao', social_id) 조회
-- 3. 존재하면 로그인 / 없으면 신규 가입
-- → 카카오 사용자 식별 키는 email 이 아닌 social_id
-- → 이메일 제공 미동의 시 email NULL 허용
-- ================================================
CREATE TABLE users (
    user_id                 UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용 (auto-increment 대비 분산 환경·보안에 유리)

    email                   VARCHAR(320)    NULL,
    -- RFC 5321 기준 이메일 최대 320자
    -- 로그인 아이디로 사용, 변경 불가
    -- 일반 로그인: 필수 (chk_users_auth 로 보장)
    --              이메일 인증 완료 후에만 INSERT 되므로 미인증 행 없음
    -- 카카오 로그인: 이메일 제공 미동의 시 NULL 허용
    --              식별은 social_id 로 처리

    password_hash           VARCHAR(255)    NULL,
    -- bcrypt 해시 저장
    -- 소셜 전용 계정은 NULL

    nickname                VARCHAR(12)     NOT NULL,
    -- 명세 기준 2~12자, 중복 불가
    -- 앱단에서 길이 validation 병행

    profile_image_url       TEXT            NULL,
    -- 선택 입력
    -- 기본 프로필 이미지는 앱단에서 처리

    social_provider         VARCHAR(20)     NULL,
    -- 소셜 로그인 제공자 식별 (예: 'kakao')
    -- 일반 가입은 NULL

    social_id               TEXT            NULL,
    -- 소셜 제공자의 고유 사용자 식별자
    -- 일반 가입은 NULL
    -- 소셜 로그인 시 필수 (chk_users_auth 로 보장)

    role                    VARCHAR(20)     NOT NULL DEFAULT 'user',
    -- 계정 권한 구분
    -- 'user': 일반 사용자
    -- 'admin': 관리자 (서비스 제공 코스 등록, 신고 처리 등)

    status                  VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 계정 상태 관리 (소프트 딜리트 방식)
    -- 'active': 정상
    -- 'suspended': 신고 누적 정지
    -- 'deleted': 탈퇴 (행 삭제 없이 status 로 관리)

    pref_conditions         JSONB           NULL,
    -- 선호 조건 정보 저장 (선호 항목 추가 시 컬럼 변경 불필요)
    -- pref_tag_ids(선호 태그)와 구분: 이 컬럼은 난이도·거리·시간 조건만 저장
    -- 예: {
    --   "difficulty": "easy",        -- 선호 난이도: easy / normal / hard
    --   "distance": [1000, 5000],    -- 선호 거리 범위 (미터 단위)
    --   "duration": [30, 90]         -- 선호 소요 시간 범위 (분 단위)
    -- }
    -- 미설정 시 NULL, 앱단에서 값 범위·형식 validation 필요

    pref_tag_ids            JSONB           NULL,
    -- 선호 태그 ID 목록 (tags 테이블의 tag_id 참조)
    -- 스팟 태그·코스 태그를 구분하여 저장하기 위해 UUID[] → JSONB 로 변경
    -- 예: {
    --   "spot":   ["uuid1", "uuid2"],   -- 선호 스팟 태그 ID 목록
    --   "course": ["uuid3", "uuid4"]    -- 선호 코스 태그 ID 목록
    -- }
    -- 미설정 시 NULL, key 생략 가능 (spot 만 설정하고 course 생략 허용)
    -- [주의] tags 테이블에 FK 제약 불가 (JSONB 타입은 FK 미지원)
    --        존재하지 않는 tag_id 가 들어와도 DB단에서 차단 불가
    --        반드시 앱단 validation 으로 tag_id 유효성·type 일치 검증 필요
    -- GIN 인덱스로 JSONB 검색 성능 보완 (하단 인덱스 참고)

    pref_categories         JSONB           NULL,
    -- 선호 카테고리 목록 (spots.categories · courses.category 값 참조)
    -- 스팟 카테고리·코스 카테고리를 구분하여 저장
    -- 예: {
    --   "spot":   ["공원·광장", "강·하천", "호수·저수지"],  -- 선호 스팟 카테고리 목록
    --   "course": ["둘레길", "숲길"]       -- 선호 코스 카테고리 목록
    -- }
    -- 미설정 시 NULL, key 생략 가능 (spot 만 설정하고 course 생략 허용)
    -- [주의] spots.categories 는 chk_spots_categories 로 허용값을 제한하지만,
    --        JSONB 배열인 users.pref_categories 는 FK/CHECK 로 세부 값을 검증하기 어려움
    --        courses.category 도 자유 문자열이므로 앱단 validation 병행 필요
    -- GIN 인덱스로 JSONB 검색 성능 보완 (하단 인덱스 참고)

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- updated_at: 트리거로 자동 갱신 (하단 트리거 참고)

    CONSTRAINT pk_users
        PRIMARY KEY (user_id),

    CONSTRAINT uq_users_email
        UNIQUE (email),
    -- 이메일 중복 가입 방지
    -- PostgreSQL UNIQUE 는 NULL 을 중복으로 보지 않으므로
    -- 카카오 이메일 미동의 사용자(email NULL) 여러 명 가능

    CONSTRAINT uq_users_nickname
        UNIQUE (nickname),
    -- 닉네임 중복 방지

    CONSTRAINT chk_users_nickname_length
        CHECK (char_length(nickname) >= 2),
    -- 닉네임 최소 2자 보장
    -- 최대 12자는 VARCHAR(12) 로 보장

    CONSTRAINT chk_users_role
        CHECK (role IN ('user', 'admin')),
    -- role 허용값 외 입력 차단

    CONSTRAINT chk_users_status
        CHECK (status IN ('active', 'suspended', 'deleted')),
    -- status 허용값 외 입력 차단

    CONSTRAINT chk_users_auth
        CHECK (
            (social_provider IS NULL
                AND email IS NOT NULL
                AND password_hash IS NOT NULL)
            OR
            (social_provider IS NOT NULL
                AND social_id IS NOT NULL)
        )
    -- 인증 방식 무결성 보장
    -- 일반 로그인: email + password_hash 둘 다 필수
    -- 소셜 로그인: social_provider + social_id 둘 다 필수
    --             email 은 카카오 미동의 시 NULL 허용
);

-- 소셜 로그인 중복 방지
-- Partial Index: social_provider 가 있는 행에만 적용
-- 동일 제공자에서 같은 social_id 중복 가입 차단
CREATE UNIQUE INDEX uix_users_social
    ON users (social_provider, social_id)
    WHERE social_provider IS NOT NULL;

-- 계정 상태 필터 조회용
-- 관리자 페이지, 정지 계정 체크 등 status 조회 빈도 높음
CREATE INDEX ix_users_status
    ON users (status);

-- 관리자 계정 조회용 Partial Index
-- 서비스 제공 코스 조회, 신고 처리 권한 체크 시 사용
CREATE INDEX ix_users_admin
    ON users (user_id)
    WHERE role = 'admin';

-- 선호 태그 JSONB 검색용 GIN 인덱스
-- 특정 tag_id 를 포함한 유저 조회 시 사용
-- 예: WHERE pref_tag_ids @> '{"spot": ["uuid1"]}'
CREATE INDEX ix_users_pref_tag_ids
    ON users USING GIN (pref_tag_ids);

-- 선호 카테고리 JSONB 검색용 GIN 인덱스
-- 특정 카테고리를 선호하는 유저 조회 시 사용
-- 예: WHERE pref_categories @> '{"spot": ["공원·광장"]}'
CREATE INDEX ix_users_pref_categories
    ON users USING GIN (pref_categories);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: tags
-- 코스·스팟에 사용되는 태그 서버 관리 테이블
-- 사용자 직접 입력 불가, 서버에서만 등록·관리
-- ================================================
CREATE TABLE tags (
    tag_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    name        VARCHAR(20)     NOT NULL,
    -- 태그명 (예: '자연', '도시', '고요한 분위기')
    -- 사용자 직접 입력 불가, 서버에서만 관리

    type        VARCHAR(10)     NOT NULL,
    -- 태그 적용 대상 구분
    -- 'course': 코스 태그 / 'spot': 스팟 태그

    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    -- 태그 활성화 여부
    -- TRUE: 활성화 (사용자 선택 가능)
    -- FALSE: 비활성화 (선택 불가, 목록에서 숨김)
    -- 계절 태그 관리용 (예: #벚꽃 봄 외 시즌 비활성화, #단풍 가을 외 비활성화)

    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_tags
        PRIMARY KEY (tag_id),

    CONSTRAINT uq_tags_name_type
        UNIQUE (name, type),
    -- 같은 type 내 태그명 중복 방지
    -- (코스·스팟 간 동일 태그명은 허용)

    CONSTRAINT chk_tags_type
        CHECK (type IN ('course', 'spot'))
    -- type 허용값 외 입력 차단
);

-- 태그 type 별 조회용
-- 코스 등록·스팟 등록 시 해당 type 태그 목록 조회 빈도 높음
CREATE INDEX ix_tags_type
    ON tags (type);
-- [주의] tags 삭제 시 users.pref_tag_ids 배열에 남아있는
--        tag_id 정리는 앱단에서 처리 필요 (배열 타입 FK 미지원)


-- ================================================
-- TABLE: spots
-- 서비스 제공 스팟 (서버 소유, 전체 공개)
-- AI 음성 안내 콘텐츠 유형 고정 3개 (장소 안내 / 역사 해설 / 관광 안내)
-- ================================================
CREATE TABLE spots (
    spot_id             UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    kakao_place_id        TEXT            NULL,
    -- 카카오 Local API documents[].id 저장
    -- 예: "13121007"
    -- 사용자가 카카오 검색 결과에서 장소를 선택했을 때,
    -- 같은 장소가 spots에 중복 INSERT 되지 않도록 판단하는 기준
    -- 관리자 직접 등록 장소는 카카오 ID가 없을 수 있으므로 NULL 허용


    name                VARCHAR(100)    NOT NULL,
    -- 스팟명
    -- 카카오 Local API 저장 시 documents[].place_name 사용
    -- 예: "한강", "뚝섬한강공원"

    location            GEOGRAPHY(POINT, 4326)  NOT NULL,
    -- 스팟 위치 (위경도 통합)
    -- 예: ST_Point(126.97, 37.56)::GEOGRAPHY  (경도, 위도 순서)
    -- 카카오 Local API 저장 시 documents[].x = 경도, documents[].y = 위도 사용
    -- [주의] PostGIS Point는 경도(lng), 위도(lat) 순서
    -- GEOGRAPHY 타입이 좌표 유효성 자동 검증 (별도 CHECK 불필요)

    address             TEXT            NULL,
    -- 주소
    -- 카카오 Local API documents[].address_name 저장
    -- 예: "서울 강북구 우이동 산 40-1"
    -- road_address_name은 별도 컬럼으로 저장하지 않음

    categories          TEXT[]          NOT NULL DEFAULT '{}',
    -- 앱 검색용 카테고리 목록
    -- 카카오 category_name의 마지막 값과 장소명 예외 규칙을 앱 기준 카테고리 배열로 변환해 저장
    -- 예:
    --   "여행 > 관광,명소 > 강"       → ARRAY['강·하천']
    --   "여행 > 공원 > 도시근린공원" → ARRAY['공원·광장']
    --   "금강습지생태공원"처럼 복합 성격의 장소 → ARRAY['생태·서식지', '공원·광장']
    -- 사용자가 카테고리 검색할 때 이 배열에 해당 카테고리가 포함되는지 기준으로 필터링

    kakao_category_name TEXT            NULL,
    -- 카카오 원본 카테고리 전체 저장
    -- 예: "여행 > 관광,명소 > 강"
    -- categories는 앱 검색용으로 가공된 값이므로,
    -- 원본 응답 추적과 추후 카테고리 매핑 규칙 변경을 위해 보관

    source              VARCHAR(20)     NOT NULL DEFAULT 'admin',
    -- 장소 등록 출처
    -- 'admin': 관리자가 직접 등록한 장소
    -- 'kakao': 사용자가 카카오 검색 결과에서 선택해 저장된 장소
    
    content_place       TEXT            NULL,
    -- 장소 안내 해설 텍스트
    -- NULL 이면 해당 스팟은 장소 안내 불가

    content_history     TEXT            NULL,
    -- 역사 해설 텍스트
    -- NULL 이면 해당 스팟은 역사 해설 불가

    content_tour        TEXT            NULL,
    -- 관광 안내 해설 텍스트
    -- NULL 이면 해당 스팟은 관광 안내 불가

    recommend_pct       DECIMAL(5,2)    NULL,
    -- 추천도 퍼센트 캐시값
    -- spot_reviews.is_recommended TRUE 비율
    -- 예: 85.50 (85.5%)
    -- 후기 등록·수정·삭제 시 트리거 또는 앱단에서 업데이트
    -- 후기 없을 시 NULL

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': 정상 / 'hidden': 신고로 숨김

    last_synced_at      TIMESTAMPTZ     NULL,
    -- 카카오 API 응답으로 마지막 갱신한 시각
    -- source = 'kakao'인 장소를 다시 보강/동기화할 때 사용
    -- 관리자 직접 등록 장소는 NULL 가능

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spots
        PRIMARY KEY (spot_id),

    CONSTRAINT chk_spots_status
        CHECK (status IN ('active', 'hidden')),

    CONSTRAINT chk_spots_source
        CHECK (source IN ('admin', 'kakao')),

    CONSTRAINT chk_spots_recommend_pct
        CHECK (recommend_pct IS NULL OR recommend_pct BETWEEN 0 AND 100),
    -- 추천도 0~100% 범위 검증

    CONSTRAINT chk_spots_categories
        CHECK (
            categories <@ ARRAY[
            '산',
            '숲·휴양림',
            '수목원·정원',
            '강·하천',
            '호수·저수지',
            '계곡·폭포',
            '해수욕장·해변',
            '생태·서식지',
            '공원·광장'
            ]::TEXT[]
        )
    -- categories 배열에는 앱에서 허용한 카테고리명만 저장
    -- <@ 연산자는 왼쪽 배열이 오른쪽 배열의 부분집합인지 확인
);

-- 위치 기반 반경 검색·거리 정렬용 GiST 인덱스
-- ST_DWithin(), ST_Distance() 등 PostGIS 함수와 함께 사용
CREATE INDEX ix_spots_location
    ON spots USING GIST (location);

-- 상태 필터 조회용
CREATE INDEX ix_spots_status
    ON spots (status);

-- 콘텐츠 유형별 Partial Index
-- NULL 이 아닌 행만 인덱싱하여 해설 가능 스팟 검색 성능 보완
CREATE INDEX ix_spots_content_place
    ON spots (spot_id) WHERE content_place IS NOT NULL;

CREATE INDEX ix_spots_content_history
    ON spots (spot_id) WHERE content_history IS NOT NULL;

CREATE INDEX ix_spots_content_tour
    ON spots (spot_id) WHERE content_tour IS NOT NULL;

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_spots_updated_at
    BEFORE UPDATE ON spots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX uix_spots_kakao_place_id
    ON spots (kakao_place_id);
-- 카카오 장소 중복 저장 방지
-- PostgreSQL UNIQUE는 NULL을 서로 다른 값으로 보므로,
-- kakao_place_id가 NULL인 관리자 직접 등록 장소는 여러 개 저장 가능

CREATE INDEX ix_spots_categories
    ON spots USING GIN (categories);
-- 사용자 장소 카테고리 검색용
-- 예: WHERE categories @> ARRAY['강·하천']::TEXT[]

-- ================================================
-- TABLE: courses
-- 서비스 제공 코스 + 사용자 등록 코스 통합 관리
-- 경유지(스팟·핀) 순서는 course_waypoints 테이블로 분리 관리
--
-- [서비스 제공 코스 구분]
-- is_service 컬럼 없이 owner_id → users.role = 'admin' 조인으로 구분
-- 서비스 제공 코스: owner_id 의 role = 'admin'
-- 사용자 등록 코스: owner_id 의 role = 'user'
--
-- [difficulty·rating 없음]
-- 코스 자체에 difficulty·rating 없음
-- 모든 후기(원작자 포함)의 difficulty·rating 평균값으로 표시
-- course_reviews 단일 테이블에서 집계
--
-- [원작자 흐름]
-- 경로만 그려서 등록 → courses + course_waypoints INSERT (walk_records 없음)
-- 실제로 걷고 나서 → walk_records INSERT → course_reviews INSERT
-- ================================================
CREATE TABLE courses (
    course_id           UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    owner_id            UUID            NOT NULL,
    -- 코스 등록자: users.user_id 참조
    -- 서비스 제공 코스는 서비스 관리자 계정 user_id 사용

    name                VARCHAR(100)    NOT NULL,
    -- 코스명

    description         TEXT            NULL,
    -- 코스 소개 텍스트 (선택 입력)

    category            VARCHAR(20)     NULL,
    -- 코스 분류 카테고리 (예: '둘레길')
    -- 선택 입력. 코스 등록 시 카테고리 선택 가능

    route_geometry      GEOGRAPHY(LINESTRING, 4326)  NOT NULL,
    -- DB 공간 연산 전용 컬럼
    -- course_waypoints 의 모든 경유지(스팟·핀) 좌표를 seq 순서대로 추출한 LINESTRING
    -- 스팟 좌표: spots.location 기준 / 핀 좌표: course_waypoints.lat·lng 기준
    --
    -- [용도 1] 총 거리 자동 계산
    --   ST_Length(route_geometry) → 미터 단위 거리 반환
    --   estimated_duration 계산 기준으로도 사용
    --
    -- [용도 2] 가까운순 정렬
    --   ST_Distance(route_geometry, ST_Point(:lng, :lat)::GEOGRAPHY)
    --   경유지 포함 가장 가까운 지점 기준으로 정렬
    --
    -- [용도 3] 반경 내 코스 검색
    --   ST_DWithin(route_geometry, ST_Point(:lng, :lat)::GEOGRAPHY, 5000)
    --   경로가 사용자 위치 반경 5km 이내를 지나는 코스 검색
    --
    -- [용도 4] 경로 상 스팟 자동 감지
    --   ST_DWithin(spots.location, route_geometry, 50)
    --   경로 반경 50m 이내 스팟 자동 감지 및 추가 제안
    --
    -- [주의] 스팟 좌표(spots.location) 수정 시 route_geometry 도 함께 업데이트 필요
    --        (앱단 또는 트리거로 처리)
    -- [주의] 이용자의 실제 이동 경로 표시는 이 컬럼이 아닌
    --        walk_records.actual_route 를 사용해야 함
    --        (route_geometry = 코스 계획 경로 / actual_route = 실제 이동 경로)

    total_distance      INT             NOT NULL,
    -- 총 거리 (미터 단위)
    -- route_geometry 확정 시 ST_Length(route_geometry) 로 자동 계산 후 저장
    -- 경로 수정 시 업데이트 필요

    estimated_duration  INT             NOT NULL,
    -- 예상 소요 시간 (분 단위, 도보 평균 속도 기반 자동 계산)

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- 공개/비공개 설정
    -- 비공개 코스는 본인만 열람 가능

    -- [서비스 제공 코스 구분]
    -- owner_id 의 users.role = 'admin' 이면 서비스 제공 코스
    -- owner_id 의 users.role = 'user' 이면 사용자 등록 코스
    -- is_service 컬럼 없이 users.role 조인으로 구분

    data_source         VARCHAR(100)    NULL,
    -- 공공 데이터 출처
    -- 예: '서울시 공공데이터포털', '국가공간정보포털'
    -- 사용자 등록 코스는 NULL

    source_id           VARCHAR(100)    NULL,
    -- 공공 데이터 원본 ID (중복 등록 방지용)
    -- 예: 서울 둘레길 코스 고유 ID
    -- 사용자 등록 코스는 NULL

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': 정상
    -- 'hidden': 신고 누적으로 자동 숨김
    -- 'deleted': 삭제 (소프트 딜리트)

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_courses
        PRIMARY KEY (course_id),

    CONSTRAINT fk_courses_owner
        FOREIGN KEY (owner_id) REFERENCES users (user_id)
        ON DELETE RESTRICT,
    -- 코스 등록자 탈퇴 시 삭제 차단
    -- 탈퇴 처리 전 코스 처리 방식 결정 필요 (앱단에서 처리)

    CONSTRAINT chk_courses_status
        CHECK (status IN ('active', 'hidden', 'deleted')),

    CONSTRAINT chk_courses_total_distance
        CHECK (total_distance > 0),
    -- 총 거리는 0보다 커야 함

    CONSTRAINT chk_courses_duration
        CHECK (estimated_duration > 0)
);

-- 등록자 기준 코스 조회용
-- 마이페이지 '내가 등록한 코스' 조회 시 사용
CREATE INDEX ix_courses_owner_id
    ON courses (owner_id);

-- 공공 데이터 중복 등록 방지용 Partial Index
-- source_id 가 있는 행에만 적용
CREATE UNIQUE INDEX uix_courses_source_id
    ON courses (source_id)
    WHERE source_id IS NOT NULL;

-- 공개 여부 + 상태 복합 인덱스
-- 코스 목록 조회 시 항상 함께 필터링됨
CREATE INDEX ix_courses_public_status
    ON courses (is_public, status);

-- 코스 전체 경로 공간 검색·가까운순 정렬용 GiST 인덱스
-- ST_Distance(route_geometry, ST_Point(:lng,:lat)::GEOGRAPHY) 로 가까운순 정렬
-- ST_DWithin() 으로 반경 내 코스 검색
-- 경유지 포함 가장 가까운 지점 기준으로 정렬 (방법 2)
-- 특정 위치 반경 내 경로가 지나가는 코스 검색 가능
CREATE INDEX ix_courses_route_geometry
    ON courses USING GIST (route_geometry);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: course_waypoints
-- 코스 경유지 순서 관리 (스팟·핀 통합)
--
-- [경유지 유형]
-- 'spot': 의미있는 경유지 → spot_id FK 로 spots 테이블 참조
--         좌표는 spots.location 에서 JOIN 으로 조회 (중복 저장 없음)
-- 'pin' : 경로 조정용 단순 좌표 경유지 → lat·lng 직접 저장
--
-- [순서 관리]
-- seq: 코스 내 전체 경유지 순서 (스팟·핀 통합 순번)
-- 예: spot1(seq=1) → spot2(seq=2) → pin1(seq=3) → spot2(seq=4) → pin2(seq=5)
-- 동일 스팟 재방문 가능 (PK 가 course_id + seq 이므로 spot_id 중복 허용)
--
-- [route_geometry 동기화]
-- course_waypoints INSERT·UPDATE·DELETE 시
-- courses.route_geometry 도 반드시 함께 업데이트 필요 (앱단 보장)
-- 스팟 좌표 변경(spots.location UPDATE) 시에도 동기화 필요
-- ================================================
CREATE TABLE course_waypoints (
    course_id   UUID            NOT NULL,
    -- FK: courses.course_id 참조
    -- 코스 삭제 시 경유지도 함께 삭제

    seq         SMALLINT        NOT NULL,
    -- 코스 내 경유지 순서 (1부터 시작, 스팟·핀 통합 순번)
    -- 순서 변경 시 seq 업데이트

    type        VARCHAR(10)     NOT NULL,
    -- 경유지 유형
    -- 'spot': 스팟 경유지 (spot_id 필수, lat·lng NULL)
    -- 'pin' : 단순 좌표 경유지 (lat·lng 필수, spot_id NULL)

    spot_id     UUID            NULL,
    -- type = 'spot' 일 때만 사용: spots.spot_id 참조
    -- type = 'pin'  일 때 NULL

    lat         DECIMAL(9,6)    NULL,
    -- type = 'pin' 일 때만 사용: 위도
    -- type = 'spot' 일 때 NULL (좌표는 spots.location 에서 조회)

    lng         DECIMAL(9,6)    NULL,
    -- type = 'pin' 일 때만 사용: 경도
    -- type = 'spot' 일 때 NULL (좌표는 spots.location 에서 조회)

    CONSTRAINT pk_course_waypoints
        PRIMARY KEY (course_id, seq),
    -- 복합 PK: 동일 코스 내 seq 유일 보장
    -- spot_id 중복 허용 → 동일 스팟 재방문 가능

    CONSTRAINT fk_course_waypoints_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE CASCADE,
    -- 코스 삭제 시 경유지도 함께 삭제

    CONSTRAINT fk_course_waypoints_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE RESTRICT,
    -- 경유지로 사용 중인 스팟 삭제 차단
    -- 삭제 전 연결 코스 확인 필요 (앱단에서 처리)

    CONSTRAINT chk_course_waypoints_type
        CHECK (type IN ('spot', 'pin')),

    CONSTRAINT chk_course_waypoints_columns
        CHECK (
            (type = 'spot' AND spot_id IS NOT NULL AND lat IS NULL     AND lng IS NULL    )
            OR
            (type = 'pin'  AND spot_id IS NULL     AND lat IS NOT NULL AND lng IS NOT NULL)
        ),
    -- type 별 컬럼 사용 강제
    -- spot: spot_id 필수 / lat·lng 금지
    -- pin : lat·lng 필수 / spot_id 금지

    CONSTRAINT chk_course_waypoints_seq
        CHECK (seq >= 1)
    -- seq 는 1 이상
);

-- 코스별 경유지 순서 조회용
-- 코스 상세 조회 시 seq 순으로 경유지 목록 조회
CREATE INDEX ix_course_waypoints_course_seq
    ON course_waypoints (course_id, seq);

-- 스팟 역방향 조회용
-- 특정 스팟이 포함된 코스 목록 조회
-- 스팟 삭제·숨김 처리 전 영향 코스 확인에 사용
CREATE INDEX ix_course_waypoints_spot_id
    ON course_waypoints (spot_id)
    WHERE spot_id IS NOT NULL;


-- ================================================
-- TABLE: taggings
-- 코스·스팟 태그 통합 테이블
-- user_id 로 누가 단 태그인지 구분
--
-- [코스 태그 집계]
-- 코스 상세 top 5 (제3자):
--   WHERE target_type = 'course' AND target_id = course_id
--   → 원작자 + 모든 후기 작성자 태그 합산
--
-- 마이페이지 (본인 태그만):
--   WHERE target_type = 'course' AND target_id = course_id AND user_id = :user_id
--
-- [스팟 태그 집계]
-- 스팟 상세 top 5:
--   WHERE target_type = 'spot' AND target_id = spot_id
--   → 후기 작성자 태그만 집계 (스팟 원작자 없음)
--
-- 마이페이지 (본인 태그만):
--   WHERE target_type = 'spot' AND target_id = spot_id AND user_id = :user_id
-- ================================================
CREATE TABLE taggings (
    tag_id          UUID            NOT NULL,
    -- tags.tag_id 참조

    target_id       UUID            NOT NULL,
    -- 태그 대상 ID
    -- target_type = 'course' -> courses.course_id
    -- target_type = 'spot'   -> spots.spot_id

    target_type     VARCHAR(20)     NOT NULL,
    -- 태그 대상 구분
    -- 'course': 코스 태그 (원작자·후기 통합)

    user_id         UUID            NOT NULL,
    -- 태그를 단 사용자: users.user_id 참조
    -- 원작자: 코스 등록자
    -- 후기 작성자: 후기 작성 시 함께 저장
    -- 마이페이지에서 본인이 단 태그 필터링에 사용

    CONSTRAINT pk_taggings
        PRIMARY KEY (tag_id, target_id, target_type, user_id),
    -- 복합 PK: 같은 사용자가 같은 대상에 동일 태그 중복 방지

    CONSTRAINT fk_taggings_tag
        FOREIGN KEY (tag_id) REFERENCES tags (tag_id)
        ON DELETE CASCADE,
    -- 태그 삭제 시 연결 데이터도 함께 삭제

    CONSTRAINT fk_taggings_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 태그 연결도 함께 삭제

    CONSTRAINT chk_taggings_target_type
        CHECK (target_type IN ('course', 'spot'))
    -- 'course': 코스 태그 (원작자·후기 통합)
    -- 'spot': 스팟 후기 태그 (원작자 없음, 후기 작성자만)
);

-- 코스 태그 top 5 집계·목록 조회용
-- WHERE target_type = 'course' AND target_id = course_id
CREATE INDEX ix_taggings_target
    ON taggings (target_type, target_id);

-- 마이페이지 본인 태그 조회용
-- WHERE target_type = 'course' AND target_id = course_id AND user_id = :user_id
CREATE INDEX ix_taggings_user_target
    ON taggings (user_id, target_type, target_id);

-- 태그 기준 코스 검색용
-- 특정 태그가 달린 코스 목록 조회 시 사용
CREATE INDEX ix_taggings_tag_id
    ON taggings (tag_id);

-- 코스 삭제 시 taggings 자동 삭제 트리거
CREATE OR REPLACE FUNCTION delete_course_taggings()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM taggings
    WHERE target_id = OLD.course_id
    AND target_type = 'course';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_course_taggings
    AFTER DELETE ON courses
    FOR EACH ROW EXECUTE FUNCTION delete_course_taggings();

-- 스팟 삭제 시 taggings 자동 삭제 트리거
-- target_type = 'spot' 인 태그 연결 삭제
CREATE OR REPLACE FUNCTION delete_spot_taggings()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM taggings
    WHERE target_id = OLD.spot_id
    AND target_type = 'spot';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_spot_taggings
    AFTER DELETE ON spots
    FOR EACH ROW EXECUTE FUNCTION delete_spot_taggings();


-- ================================================
-- TABLE: bookmarks
-- 코스·스팟 북마크 통합 테이블
-- target_type 으로 코스·스팟 구분
-- [주의] target_id FK 불가 → 트리거로 무결성 보완
-- ================================================
CREATE TABLE bookmarks (
    bookmark_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    user_id         UUID            NOT NULL,
    -- 북마크한 사용자: users.user_id 참조

    target_id       UUID            NOT NULL,
    -- 북마크 대상 ID
    -- target_type = 'course' -> courses.course_id
    -- target_type = 'spot'   -> spots.spot_id

    target_type     VARCHAR(10)     NOT NULL,
    -- 북마크 대상 구분: 'course' / 'spot'

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_bookmarks
        PRIMARY KEY (bookmark_id),

    CONSTRAINT uq_bookmarks
        UNIQUE (user_id, target_id, target_type),
    -- 같은 사용자가 같은 대상 중복 북마크 방지

    CONSTRAINT fk_bookmarks_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 북마크도 함께 삭제

    CONSTRAINT chk_bookmarks_target_type
        CHECK (target_type IN ('course', 'spot'))
    -- [주의] target_id FK 불가 (target_type 에 따라 참조 테이블 달라짐)
    --        트리거로 무결성 보완 (하단 트리거 참고)
);

-- 사용자별 북마크 목록 조회용
-- 마이페이지 북마크 탭 조회 시 사용
CREATE INDEX ix_bookmarks_user_type
    ON bookmarks (user_id, target_type);

-- 코스 삭제 시 bookmarks 자동 삭제 트리거
CREATE OR REPLACE FUNCTION delete_course_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM bookmarks
    WHERE target_id = OLD.course_id
    AND target_type = 'course';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_course_bookmarks
    AFTER DELETE ON courses
    FOR EACH ROW EXECUTE FUNCTION delete_course_bookmarks();

-- 스팟 삭제 시 bookmarks 자동 삭제 트리거
CREATE OR REPLACE FUNCTION delete_spot_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM bookmarks
    WHERE target_id = OLD.spot_id
    AND target_type = 'spot';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_spot_bookmarks
    AFTER DELETE ON spots
    FOR EACH ROW EXECUTE FUNCTION delete_spot_bookmarks();


-- ================================================
-- TABLE: walk_records
-- 산책 기록 테이블
-- 코스 기반 산책 + 자유 경로 기록 통합 관리
-- ================================================
CREATE TABLE walk_records (
    walk_record_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    user_id             UUID            NOT NULL,
    -- 산책한 사용자: users.user_id 참조

    course_id           UUID            NULL,
    -- 산책한 코스: courses.course_id 참조
    -- 자유 경로 기록 시 NULL
    -- 코스 삭제 시 NULL 로 변경 (산책 기록은 유지)

    actual_route        GEOGRAPHY(LINESTRING, 4326)  NULL,
    -- 실제 이동 경로 GPS 좌표 (LINESTRING)
    -- 예: ST_GeomFromText('LINESTRING(126.97 37.56, 126.98 37.57)', 4326)
    -- ST_Length() 로 실제 이동 거리 자동 계산
    -- 미완주·중단 시에도 이동한 만큼 저장
    -- 진행 중일 때는 NULL

    total_distance      INT             NULL,
    -- 실제 이동 거리 (미터 단위)
    -- 산책 종료 시 ST_Length(actual_route) 로 자동 계산 후 저장

    duration            INT             NULL,
    -- 실제 소요 시간 (분 단위)
    -- 산책 종료 시 자동 계산

    is_completed        BOOLEAN         NOT NULL DEFAULT FALSE,
    -- 완주 여부
    -- TRUE: 코스 완주 / FALSE: 중도 종료

    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- 산책 시작 시각

    ended_at            TIMESTAMPTZ     NULL,
    -- 산책 종료 시각
    -- 진행 중일 때는 NULL

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_walk_records
        PRIMARY KEY (walk_record_id),

    CONSTRAINT fk_walk_records_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 산책 기록도 함께 삭제

    CONSTRAINT fk_walk_records_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE SET NULL,
    -- 코스 삭제 시 course_id NULL 로 변경 (산책 기록 유지)

    CONSTRAINT chk_walk_records_ended
        CHECK (ended_at IS NULL OR ended_at >= started_at)
    -- 종료 시각은 시작 시각보다 이후여야 함
);

-- 사용자별 산책 기록 최신순 조회용
-- 마이페이지 이용 기록, 최근 산책 코스 조회 시 사용
CREATE INDEX ix_walk_records_user_started
    ON walk_records (user_id, started_at DESC);

-- 코스별 산책 기록 조회용
-- 코스 상세에서 이용 횟수 집계 시 사용
CREATE INDEX ix_walk_records_course_id
    ON walk_records (course_id)
    WHERE course_id IS NOT NULL;

-- [이용한 스팟 조회 방법]
-- 코스 기반 산책: courses.route JSONB 파싱으로 스팟 목록 추출
-- 자유 경로 산책: ST_DWithin(spots.location, actual_route, 반경) 으로 감지


-- ================================================
-- TABLE: course_reviews
-- 코스 후기 테이블
-- 산책 종료 후 또는 피드에서 직접 작성 가능
-- ================================================
CREATE TABLE course_reviews (
    course_review_id    UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    user_id             UUID            NOT NULL,
    -- 후기 작성자: users.user_id 참조

    course_id           UUID            NOT NULL,
    -- 후기 대상 코스: courses.course_id 참조

    walk_record_id      UUID            NOT NULL,
    -- 연결된 산책 기록: walk_records.walk_record_id 참조
    -- 원작자·후기 사용자 모두 실제로 걷고 난 후 작성
    -- walk_records.total_distance, duration 으로 실제 이동 기록 연결

    description         TEXT            NULL,
    -- 후기 내용 (선택 입력)

    difficulty          VARCHAR(10)     NULL,
    -- 실제 걸어본 난이도
    -- 'easy' / 'normal' / 'hard' / NULL: 미입력
    -- 코스 탐색 시 모든 후기의 평균값으로 표시
    -- easy=1, normal=2, hard=3 으로 수치 변환 후 평균 계산
    -- 예: AVG(CASE difficulty WHEN 'easy' THEN 1 WHEN 'normal' THEN 2 WHEN 'hard' THEN 3 END)

    rating              DECIMAL(2,1)    NULL,
    -- 평점 (1.0 ~ 5.0, 0.5 단위) / NULL: 미입력
    -- 코스 탐색 시 모든 후기의 평균값으로 표시

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- 공개/비공개 설정

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': 정상 / 'hidden': 신고로 숨김

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_course_reviews
        PRIMARY KEY (course_review_id),

    CONSTRAINT fk_course_reviews_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 후기도 함께 삭제

    CONSTRAINT fk_course_reviews_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON DELETE CASCADE,
    -- 코스 삭제 시 후기도 함께 삭제

    CONSTRAINT fk_course_reviews_walk
        FOREIGN KEY (walk_record_id) REFERENCES walk_records (walk_record_id)
        ON DELETE RESTRICT,
    -- walk_record_id NOT NULL 이므로 산책 기록 삭제 차단
    -- 후기 삭제 후 walk_records 삭제 필요 (앱단에서 처리)

    CONSTRAINT uq_course_reviews_walk_record
        UNIQUE (walk_record_id),
    -- 이용 기록 1건 당 코스 후기 1번만 작성 가능
    -- 동일 walk_record_id 로 중복 후기 INSERT 차단

    CONSTRAINT chk_course_reviews_difficulty
        CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
    -- NULL: 미입력 허용

    CONSTRAINT chk_course_reviews_rating
        CHECK (rating IS NULL OR rating BETWEEN 1.0 AND 5.0),
    -- 평점 범위 검증 (미입력 시 NULL 허용)

    CONSTRAINT chk_course_reviews_status
        CHECK (status IN ('active', 'hidden'))
);

-- 코스별 후기 최신순 조회용
CREATE INDEX ix_course_reviews_course_id
    ON course_reviews (course_id, created_at DESC);

-- 사용자별 후기 조회용
-- 마이페이지 나의 후기 목록 조회 시 사용
CREATE INDEX ix_course_reviews_user_id
    ON course_reviews (user_id, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_course_reviews_updated_at
    BEFORE UPDATE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: spot_reviews
-- 스팟 후기 테이블
-- 반드시 산책 기록(walk_record_id)과 연결하여 작성
-- 직접 작성(walk_record_id NULL) 불허: 이용 기록 1건 당 스팟별 1번만 작성 가능
--
-- [스팟 태그 저장 방식]
-- 후기 작성 시 선택한 태그는 taggings 테이블에 저장
--   target_type = 'spot', target_id = spot_id, user_id = 후기 작성자
-- 스팟 태그 top 5 집계:
--   SELECT tag_id, COUNT(*) FROM taggings
--   WHERE target_type = 'spot' AND target_id = spot_id
--   GROUP BY tag_id ORDER BY COUNT(*) DESC LIMIT 5
-- ================================================
CREATE TABLE spot_reviews (
    spot_review_id      UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    user_id             UUID            NOT NULL,
    -- 후기 작성자: users.user_id 참조

    spot_id             UUID            NOT NULL,
    -- 후기 대상 스팟: spots.spot_id 참조

    walk_record_id      UUID            NOT NULL,
    -- 연결된 산책 기록: walk_records.walk_record_id 참조
    -- 반드시 산책 종료 후 작성, 직접 작성(NULL) 불허
    -- walk_record_id + spot_id UNIQUE 로 이용 기록 1건 당 스팟별 1번만 작성 가능

    description         TEXT            NULL,
    -- 후기 내용 (선택 입력)

    photos              TEXT[]          NULL,
    -- 첨부 사진 URL 배열 (최대 5장, S3 등 스토리지 URL 저장)
    -- [주의] 앱단에서 최대 5장 제한 validation 필요

    is_recommended      BOOLEAN         NULL,
    -- 추천/비추천
    -- TRUE: 추천 / FALSE: 비추천 / NULL: 미선택

    is_public           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- 공개/비공개 설정

    status              VARCHAR(20)     NOT NULL DEFAULT 'active',
    -- 'active': 정상 / 'hidden': 신고로 숨김

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spot_reviews
        PRIMARY KEY (spot_review_id),

    CONSTRAINT fk_spot_reviews_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 후기도 함께 삭제

    CONSTRAINT fk_spot_reviews_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE CASCADE,
    -- 스팟 삭제 시 후기도 함께 삭제

    CONSTRAINT fk_spot_reviews_walk
        FOREIGN KEY (walk_record_id) REFERENCES walk_records (walk_record_id)
        ON DELETE RESTRICT,
    -- walk_record_id NOT NULL 이므로 산책 기록 삭제 차단
    -- 후기 삭제 후 walk_records 삭제 필요 (앱단에서 처리)

    CONSTRAINT uq_spot_reviews_walk_spot
        UNIQUE (walk_record_id, spot_id),
    -- 이용 기록 1건 당 스팟별 후기 1번만 작성 가능
    -- 동일 walk_record_id + spot_id 조합 중복 INSERT 차단

    CONSTRAINT chk_spot_reviews_status
        CHECK (status IN ('active', 'hidden')),

    CONSTRAINT chk_spot_reviews_photos
        CHECK (array_length(photos, 1) <= 5)
    -- 사진 최대 5장 제한 DB단 보완
);

-- 스팟별 후기 최신순 조회용
CREATE INDEX ix_spot_reviews_spot_id
    ON spot_reviews (spot_id, created_at DESC);

-- 사용자별 후기 조회용
-- 마이페이지 나의 후기 목록 조회 시 사용
CREATE INDEX ix_spot_reviews_user_id
    ON spot_reviews (user_id, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_spot_reviews_updated_at
    BEFORE UPDATE ON spot_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: reactions
-- 코스 후기·스팟 후기 좋아요/싫어요 통합 테이블
-- bookmarks·taggings 와 동일한 통합 방식
-- [주의] target_id FK 불가 → 트리거로 무결성 보완
-- ================================================
CREATE TABLE reactions (
    user_id         UUID            NOT NULL,
    -- 반응한 사용자: users.user_id 참조

    target_id       UUID            NOT NULL,
    -- 반응 대상 ID
    -- target_type = 'course_review' -> course_reviews.course_review_id
    -- target_type = 'spot_review'   -> spot_reviews.spot_review_id

    target_type     VARCHAR(20)     NOT NULL,
    -- 반응 대상 구분
    -- 'course_review' / 'spot_review'

    reaction        VARCHAR(10)     NOT NULL,
    -- 'like' / 'dislike'

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_reactions
        PRIMARY KEY (user_id, target_id, target_type),
    -- 복합 PK: 같은 사용자가 같은 대상에 중복 반응 방지

    CONSTRAINT fk_reactions_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 반응도 함께 삭제

    CONSTRAINT chk_reactions_target_type
        CHECK (target_type IN ('course_review', 'spot_review')),

    CONSTRAINT chk_reactions_reaction
        CHECK (reaction IN ('like', 'dislike'))
    -- [주의] target_id FK 불가 (target_type 에 따라 참조 테이블 달라짐)
    --        트리거로 무결성 보완 (하단 트리거 참고)
);

-- 대상별 반응 집계 조회용
-- 후기 상세에서 좋아요/싫어요 수 집계 시 사용
CREATE INDEX ix_reactions_target
    ON reactions (target_type, target_id);

-- 코스 후기 삭제 시 reactions 자동 삭제 트리거
CREATE OR REPLACE FUNCTION delete_course_review_reactions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM reactions
    WHERE target_id = OLD.course_review_id
    AND target_type = 'course_review';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_course_review_reactions
    AFTER DELETE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION delete_course_review_reactions();

-- 스팟 후기 삭제 시 reactions 자동 삭제 트리거
CREATE OR REPLACE FUNCTION delete_spot_review_reactions()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM reactions
    WHERE target_id = OLD.spot_review_id
    AND target_type = 'spot_review';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delete_spot_review_reactions
    AFTER DELETE ON spot_reviews
    FOR EACH ROW EXECUTE FUNCTION delete_spot_review_reactions();


-- ================================================
-- TABLE: reports
-- 길/환경 상태 신고 + 사용자/콘텐츠 신고 통합 테이블
-- report_category 로 신고 분류 구분
-- [주의] target_id FK 불가 → 앱단 validation 필요
-- ================================================
CREATE TABLE reports (
    report_id       UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    reporter_id     UUID            NULL,
    -- 신고한 사용자: users.user_id 참조
    -- 신고자 탈퇴 시 NULL 로 변경 (신고 내역 유지)

    target_id       UUID            NULL,
    -- 신고 대상 ID
    -- target_type 에 따라 참조 테이블 달라짐
    -- 위치 기반 신고 시 NULL (location 컬럼으로 대체)

    target_type     VARCHAR(20)     NOT NULL,
    -- 신고 대상 구분
    -- 환경 신고: 'course' / 'spot'
    -- 사용자 신고: 'course_review' / 'spot_review' / 'user'

    report_category VARCHAR(20)     NOT NULL,
    -- 신고 분류
    -- 'environment': 길/환경 상태 신고
    -- 'user': 사용자/콘텐츠 신고

    reason          VARCHAR(30)     NOT NULL,
    -- 신고 유형 (세부 사유)
    -- 환경: 'construction' / 'blocked' / 'dangerous' / 'info_error' / 'etc'
    -- 사용자: 'spam' / 'abuse' / 'inappropriate' / 'false_info' / 'portrait' / 'etc'

    memo            TEXT            NULL,
    -- 간단 메모 (선택 입력)

    location        GEOGRAPHY(POINT, 4326)  NULL,
    -- 산책 중 위치 기반 신고 시 신고 지점 좌표 저장
    -- 예: ST_Point(126.97, 37.56)::GEOGRAPHY
    -- 특정 코스·스팟 ID 기반 신고 시 NULL
    -- 지도에 신고 위치 핀 표시 시 사용
    -- [주의] target_id 와 location 중 하나는 반드시 존재해야 함 (chk_reports_target 으로 보장)

    photo_url       TEXT            NULL,
    -- 첨부 사진 URL (선택 입력, 1장)

    status          VARCHAR(20)     NOT NULL DEFAULT 'received',
    -- 처리 상태
    -- 'received': 접수 / 'in_progress': 처리중
    -- 'completed': 완료 / 'rejected': 반려

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_reports
        PRIMARY KEY (report_id),

    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users (user_id)
        ON DELETE SET NULL,
    -- 신고자 탈퇴 시 신고 내역 유지, reporter_id 만 NULL 로 변경

    CONSTRAINT uq_reports_duplicate
        UNIQUE (reporter_id, target_id, target_type),
    -- 동일 사용자가 동일 대상 중복 신고 방지 (명세 요구사항)

    CONSTRAINT chk_reports_target
        CHECK (
            (target_id IS NOT NULL AND location IS NULL)   -- ID 기반 신고
            OR
            (target_id IS NULL AND location IS NOT NULL)   -- 위치 기반 신고
        ),
    -- target_id (ID 기반) 또는 location (위치 기반) 중 하나는 반드시 존재
    -- 둘 다 NULL 이거나 둘 다 NOT NULL 인 경우 차단

    CONSTRAINT chk_reports_target_type
        CHECK (
            (target_type IN ('course', 'spot', 'course_review', 'spot_review', 'user') AND target_id IS NOT NULL)
            OR
            (target_type = 'location' AND location IS NOT NULL)
        ),
    -- target_type = 'location': 위치 기반 신고 (산책 중 특정 지점 신고)
    -- 나머지 target_type: ID 기반 신고

    CONSTRAINT chk_reports_category
        CHECK (report_category IN ('environment', 'user')),

    CONSTRAINT chk_reports_reason
        CHECK (reason IN (
            'construction', 'blocked', 'dangerous', 'info_error',
            'spam', 'abuse', 'inappropriate', 'false_info', 'portrait', 'etc'
        )),

    CONSTRAINT chk_reports_status
        CHECK (status IN ('received', 'in_progress', 'completed', 'rejected'))
    -- [주의] target_id FK 불가 (target_type 에 따라 참조 테이블 달라짐)
    --        앱단 validation 으로 target_id 유효성 검증 필요
);

-- 관리자 신고 목록 조회용
-- 상태별·최신순 필터 조회 빈도 높음
CREATE INDEX ix_reports_status
    ON reports (status, created_at DESC);

-- 대상별 신고 수 집계용
-- 일정 신고 수 이상 시 자동 숨김·관리자 알림 처리에 사용
CREATE INDEX ix_reports_target
    ON reports (target_type, target_id)
    WHERE target_id IS NOT NULL;

-- 위치 기반 신고 공간 검색용 GiST 인덱스
-- 특정 반경 내 신고 위치 조회 시 사용
-- 예: ST_DWithin(location, ST_Point(:lng, :lat)::GEOGRAPHY, 500)
CREATE INDEX ix_reports_location
    ON reports USING GIST (location)
    WHERE location IS NOT NULL;

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================
-- TABLE: notifications
-- 인앱 알림 테이블
-- 현재 신고 처리 완료 알림만 존재
-- 알림 유형 추가 시 target_type CHECK 값 추가 필요
-- ================================================
CREATE TABLE notifications (
    notification_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    -- PK: UUID 사용

    user_id             UUID            NOT NULL,
    -- 알림 수신 사용자: users.user_id 참조

    target_id           UUID            NULL,
    -- 알림 관련 대상 ID
    -- target_type = 'report' -> reports.report_id
    -- 알림 유형에 따라 NULL 가능
    -- [주의] target_id FK 불가 (target_type 에 따라 참조 테이블 달라짐)
    --        앱단 validation 으로 target_id 유효성 검증 필요

    target_type         VARCHAR(20)     NULL,
    -- 알림 대상 구분
    -- 'report': 신고 처리 완료 알림

    message             TEXT            NOT NULL,
    -- 알림 메시지 내용
    -- 예: '신고하신 내용이 처리되었습니다.'

    is_read             BOOLEAN         NOT NULL DEFAULT FALSE,
    -- 읽음 여부
    -- FALSE: 미읽음 / TRUE: 읽음

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_notifications
        PRIMARY KEY (notification_id),

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE,
    -- 회원 탈퇴 시 알림도 함께 삭제

    CONSTRAINT chk_notifications_target_type
        CHECK (target_type IN ('report'))
    -- 현재 신고 처리 완료 알림만 존재
    -- 알림 유형 추가 시 CHECK 값 추가 필요
);

-- 사용자별 미읽음 알림 조회용
-- 앱 상단 알림 뱃지, 알림 목록 조회 시 사용
CREATE INDEX ix_notifications_user_read
    ON notifications (user_id, is_read, created_at DESC);


-- ================================================
-- TABLE: spot_ai_contents
-- 스팟 AI 음성 안내 대본·음성 파일 저장
--
-- [역할 구분]
-- spots.content_* : 관리자가 작성한 원본 소스 텍스트
--                   AI 대본 생성·재생성의 기반 데이터
-- spot_ai_contents: 원본을 AI 가 가공한 결과물 저장
--                   대본(script) + TTS 음성 파일(audio_url)
--
-- [데이터 흐름]
-- spots.content_history (원본)
--     → AI API 로 가공
--     → script (대본) 저장
--     → TTS 변환
--     → audio_url (음성 파일 URL) 저장
--
-- [산책 중 재생 흐름]
-- 스팟 반경 진입
--     → 사용자 선택 콘텐츠 유형 확인
--     → spot_ai_contents WHERE spot_id AND content_type 조회
--     → audio_url 있으면 재생
--     → audio_url 없으면 script 로 실시간 TTS 생성 후 재생 + audio_url 저장
--
-- [음성 OFF 모드]
-- audio_url 재생 대신 script 를 텍스트 팝업으로 표시
--
-- [코스와의 관계]
-- spot_ai_contents 는 코스와 무관하게 스팟에 귀속
-- 같은 스팟이 여러 코스에 포함되어도 1회만 생성하면 재사용 가능
--
-- [실시간 TTS 처리 항목 - DB 저장 불필요]
-- 산책 시작 안내: 앱단 템플릿 + courses.name·estimated_duration·route(스팟 수)
-- 길 안내(방향): 지도 API 네비게이션 실시간 처리
-- 산책 종료 안내: 앱단 템플릿 + walk_records.total_distance + 방문 스팟 수(JSONB/ST_DWithin 집계)
-- ================================================
CREATE TABLE spot_ai_contents (
    spot_id             UUID            NOT NULL,
    -- PK(복합) + FK: spots.spot_id 참조
    -- 스팟 삭제 시 AI 콘텐츠도 함께 삭제

    content_type        VARCHAR(20)     NOT NULL,
    -- 콘텐츠 유형
    -- 'place'  : 장소 안내 (spots.content_place 기반)
    -- 'history': 역사 해설 (spots.content_history 기반)
    -- 'tour'   : 관광 안내 (spots.content_tour 기반)

    script              TEXT            NOT NULL,
    -- AI 가 생성한 음성 안내 대본 텍스트
    -- [음성 OFF] 텍스트 팝업 표시에 사용
    -- 음성 파일 재생성 필요 시 원본 대본으로 활용

    audio_url           TEXT            NULL,
    -- TTS 변환된 음성 파일 URL (S3 등 스토리지)
    -- [음성 ON] 재생에 사용
    -- NULL: 아직 음성 파일 미생성 상태
    --       스팟 진입 시 실시간 TTS 생성 후 저장

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_spot_ai_contents
        PRIMARY KEY (spot_id, content_type),
    -- 복합 PK: spot_ai_content_id 없이 (spot_id + content_type) 으로 유일 식별
    -- UNIQUE (spot_id, content_type) 과 동일 효과 → 별도 UNIQUE 불필요

    CONSTRAINT fk_spot_ai_contents_spot
        FOREIGN KEY (spot_id) REFERENCES spots (spot_id)
        ON DELETE CASCADE,
    -- 스팟 삭제 시 AI 콘텐츠도 함께 삭제

    CONSTRAINT chk_spot_ai_content_type
        CHECK (content_type IN ('place', 'history', 'tour'))
    -- content_type 허용값 외 입력 차단
);

-- 스팟별 AI 콘텐츠 조회용
-- 스팟 반경 진입 시 spot_id + content_type 으로 조회
CREATE INDEX ix_spot_ai_contents_spot_id
    ON spot_ai_contents (spot_id);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_spot_ai_contents_updated_at
    BEFORE UPDATE ON spot_ai_contents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
