/*
 * 개발할 때 DB 스키마를 시각적으로 확인하기 위한 참고용 자동 생성 파일입니다.
 * 실제 배포 시에는 db/erd-viewer 와 함께 삭제하세요.
 * 직접 수정하지 말고 db/schema.sql 수정 후 npm run erd:gen 또는 npm run db 를 실행하세요.
 */

export const GENERATED_AT = "2026-05-27T04:19:59.533Z";
export const TABLES = [
  {
    "id": "users",
    "ko": "사용자",
    "en": "users",
    "cols": [
      {
        "key": "PK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "이메일",
        "en": "email",
        "type": "VARCHAR(320)",
        "null": "NULL",
        "memo": "UNIQUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "비밀번호 해시",
        "en": "password_hash",
        "type": "VARCHAR(255)",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "닉네임",
        "en": "nickname",
        "type": "VARCHAR(12)",
        "null": "NN",
        "memo": "길이 >= 2. UNIQUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "프로필 이미지",
        "en": "profile_image_url",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "소셜 제공자",
        "en": "social_provider",
        "type": "VARCHAR(20)",
        "null": "NULL",
        "memo": "UNIQUE(social_provider, social_id) WHERE social_provider IS NOT NULL",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "소셜 ID",
        "en": "social_id",
        "type": "TEXT",
        "null": "NULL",
        "memo": "UNIQUE(social_provider, social_id) WHERE social_provider IS NOT NULL",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "역할",
        "en": "role",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'user'. 허용값: user / admin",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'active'. 허용값: active / suspended / deleted",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "선호 조건",
        "en": "pref_conditions",
        "type": "JSONB",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "선호 태그",
        "en": "pref_tag_ids",
        "type": "JSONB",
        "null": "NULL",
        "memo": "태그 ID/type 앱 검증",
        "fkCheck": true
      },
      {
        "key": "",
        "ko": "선호 카테고리",
        "en": "pref_categories",
        "type": "JSONB",
        "null": "NULL",
        "memo": "카테고리 허용값 앱 검증",
        "fkCheck": true
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "tags",
    "ko": "태그",
    "en": "tags",
    "cols": [
      {
        "key": "PK",
        "ko": "태그 ID",
        "en": "tag_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "이름",
        "en": "name",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "UNIQUE(name, type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "유형",
        "en": "type",
        "type": "VARCHAR(10)",
        "null": "NN",
        "memo": "허용값: course / spot. UNIQUE(name, type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "활성화 여부",
        "en": "is_active",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT TRUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "spots",
    "ko": "스팟",
    "en": "spots",
    "cols": [
      {
        "key": "PK",
        "ko": "스팟 ID",
        "en": "spot_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "kakao place id",
        "en": "kakao_place_id",
        "type": "TEXT",
        "null": "NULL",
        "memo": "UNIQUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "이름",
        "en": "name",
        "type": "VARCHAR(100)",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "위치",
        "en": "location",
        "type": "GEOGRAPHY(POINT, 4326)",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "주소",
        "en": "address",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "카테고리 목록",
        "en": "categories",
        "type": "TEXT[]",
        "null": "NN",
        "memo": "DEFAULT '{}'. 허용값: 산 / 숲·휴양림 / 수목원·정원 / 강·하천 / 호수·저수지 / 계곡·폭포 / 해수욕장·해변 / 생태·서식지 / 외 1개",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "kakao category name",
        "en": "kakao_category_name",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "source",
        "en": "source",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'admin'. 허용값: admin / kakao",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "장소 안내 원본",
        "en": "content_place",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "역사 해설 원본",
        "en": "content_history",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "관광 안내 원본",
        "en": "content_tour",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "추천도",
        "en": "recommend_pct",
        "type": "DECIMAL(5,2)",
        "null": "NULL",
        "memo": "허용범위: 0~100",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'active'. 허용값: active / hidden",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "last synced at",
        "en": "last_synced_at",
        "type": "TIMESTAMPTZ",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "카테고리 목록",
        "en": "categories",
        "type": "<@ ARRAY[",
        "null": "NULL",
        "memo": "허용값: 산 / 숲·휴양림 / 수목원·정원 / 강·하천 / 호수·저수지 / 계곡·폭포 / 해수욕장·해변 / 생태·서식지 / 외 1개",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "courses",
    "ko": "코스",
    "en": "courses",
    "cols": [
      {
        "key": "PK",
        "ko": "코스 ID",
        "en": "course_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "등록자 ID",
        "en": "owner_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE RESTRICT",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "이름",
        "en": "name",
        "type": "VARCHAR(100)",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "설명",
        "en": "description",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "카테고리",
        "en": "category",
        "type": "VARCHAR(20)",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "경로 좌표",
        "en": "route_geometry",
        "type": "GEOGRAPHY(LINESTRING, 4326)",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "총 거리",
        "en": "total_distance",
        "type": "INT",
        "null": "NN",
        "memo": "CHECK > 0",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "예상 소요시간",
        "en": "estimated_duration",
        "type": "INT",
        "null": "NN",
        "memo": "CHECK > 0",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "공개 여부",
        "en": "is_public",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT TRUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "데이터 출처",
        "en": "data_source",
        "type": "VARCHAR(100)",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "원본 ID",
        "en": "source_id",
        "type": "VARCHAR(100)",
        "null": "NULL",
        "memo": "UNIQUE WHERE source_id IS NOT NULL",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'active'. 허용값: active / hidden / deleted",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "course_waypoints",
    "ko": "코스 경유지",
    "en": "course_waypoints",
    "cols": [
      {
        "key": "PK/FK",
        "ko": "코스 ID",
        "en": "course_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> courses(course_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "PK",
        "ko": "순서",
        "en": "seq",
        "type": "SMALLINT",
        "null": "NN",
        "memo": "CHECK >= 1",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "유형",
        "en": "type",
        "type": "VARCHAR(10)",
        "null": "NN",
        "memo": "허용값: spot / pin. spot: spot_id 필수, lat/lng NULL",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "스팟 ID",
        "en": "spot_id",
        "type": "UUID",
        "null": "NULL",
        "memo": "spot일 때 필수, pin일 때 NULL. FK -> spots(spot_id) ON DELETE RESTRICT",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "위도",
        "en": "lat",
        "type": "DECIMAL(9,6)",
        "null": "NULL",
        "memo": "pin일 때 필수, spot일 때 NULL",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "경도",
        "en": "lng",
        "type": "DECIMAL(9,6)",
        "null": "NULL",
        "memo": "pin일 때 필수, spot일 때 NULL",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "taggings",
    "ko": "태깅",
    "en": "taggings",
    "cols": [
      {
        "key": "PK/FK",
        "ko": "태그 ID",
        "en": "tag_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> tags(tag_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "PK",
        "ko": "대상 ID",
        "en": "target_id",
        "type": "UUID",
        "null": "NN",
        "memo": "target_type별 대상 존재 앱 검증",
        "fkCheck": true
      },
      {
        "key": "PK",
        "ko": "대상 유형",
        "en": "target_type",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "허용값: course / spot",
        "fkCheck": false
      },
      {
        "key": "PK/FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "bookmarks",
    "ko": "북마크",
    "en": "bookmarks",
    "cols": [
      {
        "key": "PK",
        "ko": "북마크 ID",
        "en": "bookmark_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE. UNIQUE(user_id, target_id, target_type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "대상 ID",
        "en": "target_id",
        "type": "UUID",
        "null": "NN",
        "memo": "UNIQUE(user_id, target_id, target_type). target_type별 대상 존재 앱 검증",
        "fkCheck": true
      },
      {
        "key": "",
        "ko": "대상 유형",
        "en": "target_type",
        "type": "VARCHAR(10)",
        "null": "NN",
        "memo": "허용값: course / spot. UNIQUE(user_id, target_id, target_type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "walk_records",
    "ko": "산책 기록",
    "en": "walk_records",
    "cols": [
      {
        "key": "PK",
        "ko": "산책 기록 ID",
        "en": "walk_record_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "코스 ID",
        "en": "course_id",
        "type": "UUID",
        "null": "NULL",
        "memo": "FK -> courses(course_id) ON DELETE SET NULL",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "실제 경로",
        "en": "actual_route",
        "type": "GEOGRAPHY(LINESTRING, 4326)",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "총 거리",
        "en": "total_distance",
        "type": "INT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "소요시간",
        "en": "duration",
        "type": "INT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "완주 여부",
        "en": "is_completed",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT FALSE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "시작일시",
        "en": "started_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "종료일시",
        "en": "ended_at",
        "type": "TIMESTAMPTZ",
        "null": "NULL",
        "memo": "ended_at >= started_at",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "course_reviews",
    "ko": "코스 후기",
    "en": "course_reviews",
    "cols": [
      {
        "key": "PK",
        "ko": "후기 ID",
        "en": "course_review_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "코스 ID",
        "en": "course_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> courses(course_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "산책 기록 ID",
        "en": "walk_record_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> walk_records(walk_record_id) ON DELETE RESTRICT. UNIQUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "설명",
        "en": "description",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "난이도",
        "en": "difficulty",
        "type": "VARCHAR(10)",
        "null": "NULL",
        "memo": "허용값: easy / normal / hard",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "평점",
        "en": "rating",
        "type": "DECIMAL(2,1)",
        "null": "NULL",
        "memo": "허용범위: 1.0~5.0",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "공개 여부",
        "en": "is_public",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT TRUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'active'. 허용값: active / hidden",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "spot_reviews",
    "ko": "스팟 후기",
    "en": "spot_reviews",
    "cols": [
      {
        "key": "PK",
        "ko": "후기 ID",
        "en": "spot_review_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "스팟 ID",
        "en": "spot_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> spots(spot_id) ON DELETE CASCADE. UNIQUE(walk_record_id, spot_id)",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "산책 기록 ID",
        "en": "walk_record_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> walk_records(walk_record_id) ON DELETE RESTRICT. UNIQUE(walk_record_id, spot_id)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "설명",
        "en": "description",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "사진 목록",
        "en": "photos",
        "type": "TEXT[]",
        "null": "NULL",
        "memo": "array_length <= 5",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "추천 여부",
        "en": "is_recommended",
        "type": "BOOLEAN",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "공개 여부",
        "en": "is_public",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT TRUE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'active'. 허용값: active / hidden",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "reactions",
    "ko": "반응",
    "en": "reactions",
    "cols": [
      {
        "key": "PK/FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "PK",
        "ko": "대상 ID",
        "en": "target_id",
        "type": "UUID",
        "null": "NN",
        "memo": "target_type별 대상 존재 앱 검증",
        "fkCheck": true
      },
      {
        "key": "PK",
        "ko": "대상 유형",
        "en": "target_type",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "허용값: course_review / spot_review",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "반응 유형",
        "en": "reaction",
        "type": "VARCHAR(10)",
        "null": "NN",
        "memo": "허용값: like / dislike",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "reports",
    "ko": "신고",
    "en": "reports",
    "cols": [
      {
        "key": "PK",
        "ko": "신고 ID",
        "en": "report_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "신고자 ID",
        "en": "reporter_id",
        "type": "UUID",
        "null": "NULL",
        "memo": "FK -> users(user_id) ON DELETE SET NULL. UNIQUE(reporter_id, target_id, target_type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "대상 ID",
        "en": "target_id",
        "type": "UUID",
        "null": "NULL",
        "memo": "target_id/location 중 하나만 필수. UNIQUE(reporter_id, target_id, target_type). target_type별 대상 존재 앱 검증",
        "fkCheck": true
      },
      {
        "key": "",
        "ko": "대상 유형",
        "en": "target_type",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "허용값: course / spot / course_review / spot_review / user / location. location은 위치 신고. UNIQUE(reporter_id, target_id, target_type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "신고 분류",
        "en": "report_category",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "허용값: environment / user",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "신고 사유",
        "en": "reason",
        "type": "VARCHAR(30)",
        "null": "NN",
        "memo": "허용값: construction / blocked / dangerous / info_error / spam / abuse / inappropriate / false_info / 외 2개",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "메모",
        "en": "memo",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "위치",
        "en": "location",
        "type": "GEOGRAPHY(POINT, 4326)",
        "null": "NULL",
        "memo": "target_id/location 중 하나만 필수",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "사진 URL",
        "en": "photo_url",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "상태",
        "en": "status",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "DEFAULT 'received'. 허용값: received / in_progress / completed / rejected",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "notifications",
    "ko": "알림",
    "en": "notifications",
    "cols": [
      {
        "key": "PK",
        "ko": "알림 ID",
        "en": "notification_id",
        "type": "UUID",
        "null": "NN",
        "memo": "DEFAULT gen_random_uuid()",
        "fkCheck": false
      },
      {
        "key": "FK",
        "ko": "사용자 ID",
        "en": "user_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> users(user_id) ON DELETE CASCADE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "대상 ID",
        "en": "target_id",
        "type": "UUID",
        "null": "NULL",
        "memo": "target_type별 대상 존재 앱 검증",
        "fkCheck": true
      },
      {
        "key": "",
        "ko": "대상 유형",
        "en": "target_type",
        "type": "VARCHAR(20)",
        "null": "NULL",
        "memo": "허용값: report. NULL 가능",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "알림 메시지",
        "en": "message",
        "type": "TEXT",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "읽음 여부",
        "en": "is_read",
        "type": "BOOLEAN",
        "null": "NN",
        "memo": "DEFAULT FALSE",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  },
  {
    "id": "spot_ai_contents",
    "ko": "AI 음성 안내",
    "en": "spot_ai_contents",
    "cols": [
      {
        "key": "PK/FK",
        "ko": "스팟 ID",
        "en": "spot_id",
        "type": "UUID",
        "null": "NN",
        "memo": "FK -> spots(spot_id) ON DELETE CASCADE. UNIQUE(spot_id, content_type)",
        "fkCheck": false
      },
      {
        "key": "PK",
        "ko": "콘텐츠 유형",
        "en": "content_type",
        "type": "VARCHAR(20)",
        "null": "NN",
        "memo": "허용값: place / history / tour. UNIQUE(spot_id, content_type)",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "AI 대본",
        "en": "script",
        "type": "TEXT",
        "null": "NN",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "음성 파일 URL",
        "en": "audio_url",
        "type": "TEXT",
        "null": "NULL",
        "memo": "",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "생성일시",
        "en": "created_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      },
      {
        "key": "",
        "ko": "수정일시",
        "en": "updated_at",
        "type": "TIMESTAMPTZ",
        "null": "NN",
        "memo": "DEFAULT NOW()",
        "fkCheck": false
      }
    ]
  }
];
export const RELATIONS = [
  {
    "from": "users",
    "to": "courses",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "courses",
    "to": "course_waypoints",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "spots",
    "to": "course_waypoints",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "tags",
    "to": "taggings",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "users",
    "to": "taggings",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "taggings",
    "to": "courses",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "taggings",
    "to": "spots",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "users",
    "to": "bookmarks",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "bookmarks",
    "to": "courses",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "bookmarks",
    "to": "spots",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "users",
    "to": "walk_records",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "courses",
    "to": "walk_records",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "users",
    "to": "course_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "courses",
    "to": "course_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "walk_records",
    "to": "course_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "users",
    "to": "spot_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "spots",
    "to": "spot_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "walk_records",
    "to": "spot_reviews",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "users",
    "to": "reactions",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "reactions",
    "to": "course_reviews",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "reactions",
    "to": "spot_reviews",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "users",
    "to": "reports",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "reports",
    "to": "courses",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "reports",
    "to": "spots",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "reports",
    "to": "course_reviews",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "reports",
    "to": "spot_reviews",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "reports",
    "to": "users",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "users",
    "to": "notifications",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "notifications",
    "to": "reports",
    "label": "1:N",
    "fk": false
  },
  {
    "from": "spots",
    "to": "spot_ai_contents",
    "label": "1:N",
    "fk": true
  },
  {
    "from": "users",
    "to": "tags",
    "label": "N:M",
    "fk": false
  },
  {
    "from": "users",
    "to": "spots",
    "label": "pref_categories",
    "fk": false
  },
  {
    "from": "users",
    "to": "courses",
    "label": "pref_categories",
    "fk": false
  }
];
