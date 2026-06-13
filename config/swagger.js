const swaggerJsdoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'WalkBuddy API',
    version: '1.0.0',
    description: 'WalkBuddy 서비스 REST API 문서',
  },
  servers: [
  {
    url: 'http://43.200.171.53:3000',
    description: '운영 서버',
  },
  {
    url: 'http://localhost:3000',
    description: '개발 서버',
  },
],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ─────────────────────────────────────────
    // 회원가입
    // ─────────────────────────────────────────
    '/api/auth/check-email': {
      get: {
        tags: ['회원가입'],
        summary: '이메일 중복 확인',
        parameters: [
          { name: 'email', in: 'query', required: true, schema: { type: 'string', format: 'email' } },
        ],
        responses: {
          200: {
            description: '중복 확인 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { available: { type: 'boolean', example: true } } } } },
          },
        },
      },
    },
    '/api/auth/check-nickname': {
      get: {
        tags: ['회원가입'],
        summary: '닉네임 중복 확인',
        parameters: [
          { name: 'nickname', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: '중복 확인 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { available: { type: 'boolean', example: true } } } } },
          },
        },
      },
    },
    '/api/auth/email/verify/send': {
      post: {
        tags: ['회원가입'],
        summary: '이메일 인증코드 발송',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } },
        },
        responses: {
          200: {
            description: '인증코드 발송 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '인증코드가 발송되었습니다.' }, expires_in: { type: 'integer', example: 180 } } } } },
          },
        },
      },
    },
    '/api/auth/email/verify/confirm': {
      post: {
        tags: ['회원가입'],
        summary: '이메일 인증코드 확인',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'code'], properties: { email: { type: 'string', format: 'email' }, code: { type: 'string', example: '123456' } } } } },
        },
        responses: {
          200: {
            description: '인증 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { verified: { type: 'boolean', example: true }, verify_token: { type: 'string', description: '회원가입 시 사용할 인증 토큰' } } } } },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['회원가입'],
        summary: '회원가입',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'nickname', 'verify_token'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, nickname: { type: 'string' }, verify_token: { type: 'string', description: '이메일 인증 확인 후 받은 토큰' } } } } },
        },
        responses: {
          201: {
            description: '회원가입 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, email: { type: 'string' }, nickname: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 로그인
    // ─────────────────────────────────────────
    '/api/auth/login': {
      post: {
        tags: ['로그인'],
        summary: '일반 로그인',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, auto_login: { type: 'boolean' } } } } },
        },
        responses: {
          200: {
            description: '로그인 성공',
            content: { 'application/json': { schema: { type: 'object', properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, user: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, nickname: { type: 'string' }, role: { type: 'string', example: 'user' } } } } } } },
          },
        },
      },
    },
    '/api/auth/login/kakao': {
      post: {
        tags: ['로그인'],
        summary: '카카오 소셜 로그인',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string', description: '카카오 OAuth 인가코드 (?code= 값)' } } } } },
        },
        responses: {
          200: {
            description: '카카오 로그인 성공',
            content: { 'application/json': { schema: { type: 'object', properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, is_new_user: { type: 'boolean' }, user: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, email: { type: 'string' }, nickname: { type: 'string' } } } } } } },
          },
        },
      },
    },
    '/api/auth/password/reset': {
      post: {
        tags: ['로그인'],
        summary: '비밀번호 찾기 (임시 비밀번호 발송)',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } },
        },
        responses: {
          200: {
            description: '임시 비밀번호 발송 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '임시 비밀번호가 이메일로 발송되었습니다.' } } } } },
          },
        },
      },
    },
    '/api/auth/token/refresh': {
      post: {
        tags: ['로그인'],
        summary: '토큰 갱신',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } } } },
        },
        responses: {
          200: {
            description: '액세스 토큰 재발급',
            content: { 'application/json': { schema: { type: 'object', properties: { access_token: { type: 'string' } } } } },
          },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['로그인'],
        summary: '로그아웃',
        responses: {
          200: {
            description: '로그아웃 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '로그아웃 되었습니다.' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 회원
    // ─────────────────────────────────────────
    '/api/users/me': {
      get: {
        tags: ['회원'],
        summary: '내 프로필 조회',
        responses: {
          200: {
            description: '프로필 정보',
            content: { 'application/json': { schema: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, email: { type: 'string' }, nickname: { type: 'string' }, profile_image_url: { type: 'string' }, pref_tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, pref_conditions: { type: 'object' }, role: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
      patch: {
        tags: ['회원'],
        summary: '내 프로필 수정',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { nickname: { type: 'string' }, profile_image_url: { type: 'string' }, pref_tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, pref_conditions: { type: 'object' } } } } },
        },
        responses: {
          200: {
            description: '수정 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, nickname: { type: 'string' }, updated_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/users/me/password': {
      patch: {
        tags: ['회원'],
        summary: '비밀번호 변경',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['current_password', 'new_password'], properties: { current_password: { type: 'string', format: 'password' }, new_password: { type: 'string', format: 'password' } } } } },
        },
        responses: {
          200: {
            description: '비밀번호 변경 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '비밀번호가 변경되었습니다.' } } } } },
          },
        },
      },
    },
    '/api/users/me/stats': {
      get: {
        tags: ['회원'],
        summary: '활동 통계 조회',
        responses: {
          200: {
            description: '통계 정보',
            content: { 'application/json': { schema: { type: 'object', properties: { total_distance: { type: 'integer', example: 42000 }, total_duration: { type: 'integer', example: 18000 }, total_walks: { type: 'integer', example: 15 }, completed_courses: { type: 'integer', example: 12 } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 태그
    // ─────────────────────────────────────────
    '/api/tags': {
      get: {
        tags: ['태그'],
        summary: '전체 태그 목록 조회',
        description: '사용자가 선택할 수 있는 활성 태그를 코스 태그와 스팟 태그로 나누어 반환합니다.',
        security: [],
        responses: {
          200: {
            description: '태그 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, total: { type: 'integer', example: 21 }, course_count: { type: 'integer', example: 7 }, spot_count: { type: 'integer', example: 14 }, course_tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string', example: '추천산책로' }, type: { type: 'string', example: 'course' } } } }, spot_tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string', example: '문화/예술' }, type: { type: 'string', example: 'spot' } } } } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 코스
    // ─────────────────────────────────────────
    '/api/courses/search': {
      get: {
        tags: ['코스'],
        summary: '코스 검색',
        description: '공개 코스를 키워드, 위치, 거리/시간, 후기 기반 난이도·평점, 코스 태그, 포함 스팟 태그로 검색합니다. x는 경도, y는 위도이며 x와 y를 함께 전달하면 거리 계산을 합니다. radius를 함께 전달한 경우에만 반경 제한을 적용합니다.',
        security: [],
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '코스명, 설명, 카테고리 키워드 검색. q도 같은 의미로 사용할 수 있습니다.' },
          { name: 'x', in: 'query', schema: { type: 'number' }, description: '기준 경도(lng). y와 함께 전달하면 거리 계산에 사용됩니다.' },
          { name: 'y', in: 'query', schema: { type: 'number' }, description: '기준 위도(lat). x와 함께 전달하면 거리 계산에 사용됩니다.' },
          { name: 'radius', in: 'query', schema: { type: 'number' }, description: '검색 반경(m). x, y와 함께 전달한 경우에만 반경 제한을 적용합니다.' },
          { name: 'min_total_distance', in: 'query', schema: { type: 'number' }, description: '최소 총 길이(m)' },
          { name: 'max_total_distance', in: 'query', schema: { type: 'number' }, description: '최대 총 길이(m)' },
          { name: 'min_estimated_duration', in: 'query', schema: { type: 'number' }, description: '최소 예상 소요 시간(분)' },
          { name: 'max_estimated_duration', in: 'query', schema: { type: 'number' }, description: '최대 예상 소요 시간(분)' },
          { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['easy', 'normal', 'medium', 'hard'] }, description: '후기 난이도 평균 기반 필터. medium은 normal로 처리됩니다.' },
          { name: 'min_avg_rating', in: 'query', schema: { type: 'number', minimum: 0, maximum: 5 }, description: '최소 평균 평점' },
          { name: 'course_tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 코스 태그 UUID 목록. tag_ids도 같은 의미로 사용할 수 있습니다.' },
          { name: 'spot_tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 장소 태그 UUID 목록. 코스에 포함된 스팟들의 태그 합집합 기준입니다.' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['distance', 'rating', 'latest', 'length', 'duration'], default: 'distance' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '코스 검색 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, filters: { type: 'object', properties: { x: { type: 'number', example: 127.073821318894 }, y: { type: 'number', example: 37.6248431089168 }, radius: { type: 'number', example: 5000 }, min_total_distance: { type: 'number', nullable: true }, max_total_distance: { type: 'number', nullable: true }, min_estimated_duration: { type: 'number', nullable: true }, max_estimated_duration: { type: 'number', nullable: true }, difficulty: { type: 'string', nullable: true, enum: ['easy', 'normal', 'hard'] }, min_avg_rating: { type: 'number', nullable: true }, course_tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, spot_tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } }, total_count: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, courses: { type: 'array', items: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, category: { type: 'string', nullable: true }, total_distance: { type: 'integer' }, estimated_duration: { type: 'integer' }, is_public: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' }, distance: { type: 'number' }, avg_rating: { type: 'number', nullable: true }, avg_difficulty_score: { type: 'number', nullable: true }, difficulty: { type: 'string', nullable: true }, review_count: { type: 'integer' }, course_tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } }, spot_tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } }, tags: { type: 'array', items: { type: 'object' }, description: 'course_tags와 같은 값' } } } } } } } },
          },
          400: {
            description: '잘못된 검색 조건',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } } } },
          },
        },
      },
    },
    '/api/courses': {
      get: {
        tags: ['코스'],
        summary: '코스 목록 조회',
        parameters: [
          { name: 'lat', in: 'query', schema: { type: 'number' } },
          { name: 'lng', in: 'query', schema: { type: 'number' } },
          { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['easy', 'medium', 'hard'] } },
          { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'sort', in: 'query', schema: { type: 'string', example: 'rating' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '코스 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, page: { type: 'integer' }, courses: { type: 'array', items: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, total_distance: { type: 'integer' }, estimated_duration: { type: 'integer' }, difficulty: { type: 'string' }, avg_rating: { type: 'number' }, tags: { type: 'array', items: { type: 'object' } }, is_public: { type: 'boolean' } } } } } } } },
          },
        },
      },
      post: {
        tags: ['코스'],
        summary: '코스 등록',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: '산책로' },
                  description: { type: 'string', example: '설명' },
                  category: { type: 'string', example: '둘레길' },
                  route: {
                    type: 'object',
                    description: 'GeoJSON LineString. route 또는 waypoints 중 하나를 보내야 합니다.',
                    required: ['type', 'coordinates'],
                    properties: {
                      type: { type: 'string', enum: ['LineString'], example: 'LineString' },
                      coordinates: {
                        type: 'array',
                        minItems: 2,
                        items: {
                          type: 'array',
                          minItems: 2,
                          maxItems: 2,
                          items: { type: 'number' },
                          example: [126.9490481, 37.5457837],
                        },
                      },
                    },
                  },
                  waypoints: {
                    type: 'array',
                    description: '경유지 객체 배열. route 또는 waypoints 중 하나를 보내야 합니다.',
                    minItems: 2,
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          required: ['type', 'spot_id'],
                          properties: {
                            type: { type: 'string', enum: ['spot'], example: 'spot' },
                            spot_id: { type: 'string', format: 'uuid' },
                          },
                        },
                        {
                          type: 'object',
                          required: ['type', 'lat', 'lng'],
                          properties: {
                            type: { type: 'string', enum: ['pin'], example: 'pin' },
                            lat: { type: 'number', example: 37.5457837 },
                            lng: { type: 'number', example: 126.9490481 },
                          },
                        },
                      ],
                    },
                  },
                  tag_ids: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    example: [],
                  },
                  is_public: { type: 'boolean', example: true },
                },
                oneOf: [
                  { required: ['route'] },
                  { required: ['waypoints'] },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description: '코스 등록 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, total_distance: { type: 'integer' }, estimated_duration: { type: 'integer' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/courses/{course_id}': {
      get: {
        tags: ['코스'],
        summary: '코스 상세 조회',
        parameters: [{ name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '코스 상세 정보',
            content: { 'application/json': { schema: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string' }, route: { type: 'object' }, total_distance: { type: 'integer' }, estimated_duration: { type: 'integer' }, difficulty: { type: 'string' }, avg_rating: { type: 'number' }, tags: { type: 'array', items: { type: 'object' } }, spots: { type: 'array', items: { type: 'object' } }, is_public: { type: 'boolean' } } } } },
          },
        },
      },
      patch: {
        tags: ['코스'],
        summary: '코스 수정',
        parameters: [{ name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: '수정된 산책로' },
                  description: { type: 'string', example: '수정된 설명' },
                  category: { type: 'string', example: '둘레길' },
                  route: {
                    type: 'object',
                    description: 'GeoJSON LineString. 경로를 수정할 때 사용합니다.',
                    required: ['type', 'coordinates'],
                    properties: {
                      type: { type: 'string', enum: ['LineString'], example: 'LineString' },
                      coordinates: {
                        type: 'array',
                        minItems: 2,
                        items: {
                          type: 'array',
                          minItems: 2,
                          maxItems: 2,
                          items: { type: 'number' },
                          example: [126.9490481, 37.5457837],
                        },
                      },
                    },
                  },
                  waypoints: {
                    type: 'array',
                    description: '경유지 객체 배열. 경로를 수정할 때 route 대신 사용할 수 있습니다.',
                    minItems: 2,
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          required: ['type', 'spot_id'],
                          properties: {
                            type: { type: 'string', enum: ['spot'], example: 'spot' },
                            spot_id: { type: 'string', format: 'uuid' },
                          },
                        },
                        {
                          type: 'object',
                          required: ['type', 'lat', 'lng'],
                          properties: {
                            type: { type: 'string', enum: ['pin'], example: 'pin' },
                            lat: { type: 'number', example: 37.5457837 },
                            lng: { type: 'number', example: 126.9490481 },
                          },
                        },
                      ],
                    },
                  },
                  tag_ids: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    example: [],
                  },
                  is_public: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '수정 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, updated_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
      delete: {
        tags: ['코스'],
        summary: '코스 삭제',
        parameters: [{ name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '삭제 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '삭제되었습니다.' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 스팟
    // ─────────────────────────────────────────
    '/api/spots/search': {
      get: {
        tags: ['스팟'],
        summary: '스팟 통합 검색',
        description: '키워드 또는 앱 스팟 카테고리 기준으로 카카오 API 후보와 DB 저장 스팟을 함께 검색합니다. keyword 또는 q로 장소명·주소·설명 등을 검색할 수 있고, x와 y를 함께 전달하면 거리 계산을 합니다. radius는 x,y와 함께 전달한 경우에만 반경 제한으로 적용됩니다.',
        security: [],
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '장소명, 주소, 설명 키워드 검색. q도 같은 의미로 사용할 수 있습니다.' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['산', '숲·휴양림', '수목원·정원', '강·하천', '호수·저수지', '계곡·폭포', '해수욕장·해변', '생태·서식지', '공원·광장'] }, description: '앱 기준 스팟 카테고리. keyword가 없으면 category가 필요합니다.' },
          { name: 'tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 스팟 태그 UUID 목록. 선택한 태그를 모두 가진 DB 저장 스팟만 saved_spots에 포함됩니다.' },
          { name: 'x', in: 'query', schema: { type: 'number' }, description: '기준 경도(lng). y와 함께 전달하면 거리 계산에 사용됩니다.' },
          { name: 'y', in: 'query', schema: { type: 'number' }, description: '기준 위도(lat). x와 함께 전달하면 거리 계산에 사용됩니다.' },
          { name: 'radius', in: 'query', schema: { type: 'number' }, description: '검색 반경(m). x, y와 함께 전달한 경우에만 반경 제한을 적용합니다.' },
          { name: 'min_recommend_pct', in: 'query', schema: { type: 'number', minimum: 0, maximum: 100 }, description: 'DB 저장 스팟의 최소 추천도' },
        ],
        responses: {
          200: {
            description: '스팟 통합 검색 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, category: { type: 'string', example: '강·하천' }, filters: { type: 'object', properties: { tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, x: { type: 'number', nullable: true }, y: { type: 'number', nullable: true }, radius: { type: 'number', nullable: true }, min_recommend_pct: { type: 'number', nullable: true } } }, raw_count: { type: 'integer', description: '카카오 API에서 받은 원본 document 개수' }, saved_count: { type: 'integer' }, kakao_candidate_count: { type: 'integer' }, total_count: { type: 'integer' }, saved_spots: { type: 'array', items: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, kakao_place_id: { type: 'string', nullable: true }, name: { type: 'string' }, address: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, kakao_category_name: { type: 'string', nullable: true }, recommend_pct: { type: 'number', nullable: true }, x: { type: 'number' }, y: { type: 'number' }, distance: { type: 'number', nullable: true }, tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } }, is_saved: { type: 'boolean', example: true }, has_app_data: { type: 'boolean', example: true }, filter_match: { type: 'string', example: 'matched' }, result_group: { type: 'string', example: 'saved_spot' } } } }, kakao_candidates: { type: 'array', items: { type: 'object', properties: { kakao_place_id: { type: 'string' }, name: { type: 'string' }, kakao_category_name: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, address: { type: 'string', nullable: true }, x: { type: 'string' }, y: { type: 'string' }, distance: { type: 'number', nullable: true }, is_saved: { type: 'boolean', example: false }, has_app_data: { type: 'boolean', example: false }, tags: { type: 'array', items: { type: 'object' }, example: [] }, recommend_pct: { type: 'number', nullable: true }, filter_match: { type: 'string', enum: ['unknown', 'category_location_only'] }, result_group: { type: 'string', example: 'kakao_candidate' } } } }, spots: { type: 'array', items: { type: 'object' }, description: 'saved_spots와 kakao_candidates를 합친 배열' } } } } },
          },
          400: {
            description: '잘못된 검색 조건',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } } } },
          },
          500: {
            description: '카카오 API 키 누락 또는 서버 오류',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } } } },
          },
        },
      },
    },
    '/api/spots/kakao': {
      post: {
        tags: ['스팟'],
        summary: '카카오 스팟 저장/조회',
        description: '사용자가 카카오 API 검색 결과에서 특정 장소를 선택했을 때 호출합니다. DB 저장 기준은 카카오 장소이며, 저장 후 같은 좌표 주변의 TourAPI locationBasedList2 후보와 이름을 매칭합니다. 일치하는 관광 콘텐츠가 있으면 detailCommon2의 overview를 spots.content_tour에 저장해 AI 관광 음성 안내 원문으로 사용합니다. TourAPI 보강 실패는 카카오 스팟 저장 실패로 처리하지 않습니다.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['kakao_place_id', 'name', 'categories', 'x', 'y'], properties: { kakao_place_id: { type: 'string', description: '카카오 Local API documents[].id' }, name: { type: 'string', description: '카카오 Local API documents[].place_name' }, kakao_category_name: { type: 'string', nullable: true, example: '여행 > 관광,명소 > 문화유적 > 탑,비석' }, categories: { type: 'array', items: { type: 'string' }, minItems: 1, description: '앱 기준 카테고리로 매핑되면 앱 카테고리, 매핑되지 않으면 카카오 category_name의 3번째 값, 없으면 2번째 값을 사용합니다. 예: 공원·광장, 문화유적' }, address: { type: 'string', nullable: true, description: '이미 정리된 주소. road_address_name이 없을 때 사용 가능' }, road_address_name: { type: 'string', nullable: true, description: '카카오 도로명 주소. 있으면 우선 저장' }, address_name: { type: 'string', nullable: true, description: '카카오 지번 주소. 도로명 주소가 없을 때 fallback' }, x: { type: 'number', description: '장소 경도(lng)' }, y: { type: 'number', description: '장소 위도(lat)' } } } } },
        },
        responses: {
          200: {
            description: '이미 저장된 스팟 반환',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, is_created: { type: 'boolean', example: false }, tour_content_enriched: { type: 'boolean', example: true }, tour_content_status: { type: 'string', example: 'enriched' }, tour_content_match: { type: 'object', nullable: true, properties: { content_id: { type: 'string' }, title: { type: 'string' }, distance: { type: 'number', nullable: true } } }, spot: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, kakao_place_id: { type: 'string' }, name: { type: 'string' }, address: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, kakao_category_name: { type: 'string', nullable: true }, recommend_pct: { type: 'number', nullable: true }, content_tour: { type: 'string', nullable: true }, x: { type: 'number' }, y: { type: 'number' } } } } } } },
          },
          201: {
            description: '새 스팟 저장 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, is_created: { type: 'boolean', example: true }, tour_content_enriched: { type: 'boolean', example: true }, tour_content_status: { type: 'string', example: 'enriched' }, tour_content_match: { type: 'object', nullable: true, properties: { content_id: { type: 'string' }, title: { type: 'string' }, distance: { type: 'number', nullable: true } } }, spot: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, kakao_place_id: { type: 'string' }, name: { type: 'string' }, address: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, kakao_category_name: { type: 'string', nullable: true }, recommend_pct: { type: 'number', nullable: true }, content_tour: { type: 'string', nullable: true }, x: { type: 'number' }, y: { type: 'number' } } } } } } },
          },
          400: {
            description: '필수값 누락 또는 잘못된 카테고리/좌표',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } } } },
          },
          409: {
            description: '저장된 스팟이 비활성 상태라 사용할 수 없음',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string', example: 'This spot is not available' } } } } },
          },
        },
      },
    },
    '/api/spots': {
      get: {
        tags: ['스팟'],
        summary: '스팟 목록 조회',
        parameters: [
          { name: 'lat', in: 'query', schema: { type: 'number' } },
          { name: 'lng', in: 'query', schema: { type: 'number' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
        ],
        responses: {
          200: {
            description: '스팟 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, spots: { type: 'array', items: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, location: { type: 'object' }, category: { type: 'string' }, recommend_pct: { type: 'number' }, top_tags: { type: 'array', items: { type: 'object' } } } } } } } } },
          },
        },
      },
      post: {
        tags: ['스팟'],
        summary: '스팟 등록',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name', 'location', 'category'], properties: { name: { type: 'string' }, location: { type: 'object' }, category: { type: 'string' }, tags: { type: 'array', items: { type: 'string', format: 'uuid' } }, is_public: { type: 'boolean' } } } } },
        },
        responses: {
          201: {
            description: '스팟 등록 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/spots/{spot_id}': {
      get: {
        tags: ['스팟'],
        summary: '스팟 상세 조회',
        parameters: [{ name: 'spot_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '스팟 상세 정보',
            content: { 'application/json': { schema: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, location: { type: 'object' }, address: { type: 'string' }, category: { type: 'string' }, recommend_pct: { type: 'number' }, tags: { type: 'array', items: { type: 'object' } }, courses: { type: 'array', items: { type: 'object' } } } } } },
          },
        },
      },
    },
    '/api/spots/{spot_id}/ai-contents': {
      get: {
        tags: ['스팟'],
        summary: '스팟 AI 콘텐츠 조회',
        parameters: [{ name: 'spot_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'AI 콘텐츠 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, contents: { type: 'array', items: { type: 'object', properties: { content_type: { type: 'string', example: 'history' }, script: { type: 'string' }, audio_url: { type: 'string' } } } } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 산책 진행
    // ─────────────────────────────────────────
    '/api/walks': {
      post: {
        tags: ['산책 진행'],
        summary: '산책 시작',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['course_id'], properties: { course_id: { type: 'string', format: 'uuid' } } } } },
        },
        responses: {
          201: {
            description: '산책 시작',
            content: { 'application/json': { schema: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, course_id: { type: 'string', format: 'uuid' }, started_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
      get: {
        tags: ['산책 진행'],
        summary: '산책 기록 목록 조회',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '산책 기록 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, walks: { type: 'array', items: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, course_name: { type: 'string' }, total_distance: { type: 'integer' }, is_completed: { type: 'boolean' }, started_at: { type: 'string', format: 'date-time' } } } } } } } },
          },
        },
      },
    },
    '/api/walks/{walk_record_id}/end': {
      patch: {
        tags: ['산책 진행'],
        summary: '산책 종료',
        parameters: [{ name: 'walk_record_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { actual_route: { type: 'object' }, total_distance: { type: 'integer' }, duration: { type: 'integer' }, is_completed: { type: 'boolean' } } } } },
        },
        responses: {
          200: {
            description: '산책 종료',
            content: { 'application/json': { schema: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, total_distance: { type: 'integer' }, duration: { type: 'integer' }, is_completed: { type: 'boolean' }, ended_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/walks/{walk_record_id}': {
      get: {
        tags: ['산책 진행'],
        summary: '산책 기록 상세 조회',
        parameters: [{ name: 'walk_record_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '산책 기록 상세',
            content: { 'application/json': { schema: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, course: { type: 'object' }, actual_route: { type: 'object' }, total_distance: { type: 'integer' }, duration: { type: 'integer' }, is_completed: { type: 'boolean' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 후기
    // ─────────────────────────────────────────
    '/api/courses/{course_id}/reviews': {
  post: {
    tags: ['후기'],
    summary: '코스 후기 등록',
    parameters: [{ name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', required: ['rating', 'walk_record_id'], properties: {
        walk_record_id: { type: 'string', format: 'uuid', description: '산책 기록 ID' },
        rating: { type: 'number', minimum: 0, maximum: 5 },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string', format: 'uuid' } },
        difficulty: { type: 'string' }
      } } } },
    },
    responses: {
      201: {
        description: '후기 등록 완료',
        content: { 'application/json': { schema: { type: 'object', properties: { course_review_id: { type: 'string', format: 'uuid' }, course_id: { type: 'string', format: 'uuid' }, rating: { type: 'number' }, created_at: { type: 'string', format: 'date-time' } } } } },
      },
    },
  },
  get: {
    tags: ['후기'],
    summary: '코스 후기 목록 조회',
    parameters: [
      { name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
    ],
    responses: {
      200: {
        description: '코스 후기 목록',
        content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, reviews: { type: 'array', items: { type: 'object', properties: { course_review_id: { type: 'string', format: 'uuid' }, user: { type: 'object' }, rating: { type: 'number' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'object' } }, created_at: { type: 'string', format: 'date-time' } } } } } } } },
      },
    },
  },
},
    '/api/spots/{spot_id}/reviews': {
  post: {
    tags: ['후기'],
    summary: '스팟 후기 등록',
    parameters: [{ name: 'spot_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', required: ['is_recommended', 'walk_record_id'], properties: {
        walk_record_id: { type: 'string', format: 'uuid', description: '산책 기록 ID' },
        is_recommended: { type: 'boolean' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string', format: 'uuid' } },
        images: { type: 'array', items: { type: 'string' } }
      } } } },
    },
    responses: {
      201: {
        description: '스팟 후기 등록 완료',
        content: { 'application/json': { schema: { type: 'object', properties: { spot_review_id: { type: 'string', format: 'uuid' }, spot_id: { type: 'string', format: 'uuid' }, is_recommended: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } } } } },
      },
    },
  },
  get: {
    tags: ['후기'],
    summary: '스팟 후기 목록 조회',
    parameters: [
      { name: 'spot_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
    ],
    responses: {
      200: {
        description: '스팟 후기 목록',
        content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, reviews: { type: 'array', items: { type: 'object', properties: { spot_review_id: { type: 'string', format: 'uuid' }, user: { type: 'object' }, description: { type: 'string' }, is_recommended: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } } } } } } } },
      },
    },
  },
},
    '/api/reviews/{review_type}/{review_id}': {
      patch: {
        tags: ['후기'],
        summary: '후기 수정',
        parameters: [
          { name: 'review_type', in: 'path', required: true, schema: { type: 'string', enum: ['course', 'spot'] } },
          { name: 'review_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { description: { type: 'string' }, rating: { type: 'number' }, is_public: { type: 'boolean' } } } } },
        },
        responses: {
          200: {
            description: '수정 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { review_id: { type: 'string', format: 'uuid' }, updated_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
      delete: {
        tags: ['후기'],
        summary: '후기 삭제',
        parameters: [
          { name: 'review_type', in: 'path', required: true, schema: { type: 'string', enum: ['course', 'spot'] } },
          { name: 'review_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: '삭제 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '삭제되었습니다.' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 반응
    // ─────────────────────────────────────────
    '/api/reactions': {
      post: {
        tags: ['반응'],
        summary: '반응 등록 (좋아요/싫어요)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['target_id', 'target_type', 'reaction'], properties: { target_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string', example: 'review' }, reaction: { type: 'string', enum: ['like', 'dislike'] } } } } },
        },
        responses: {
          201: {
            description: '반응 등록 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { reaction_id: { type: 'string', format: 'uuid' }, reaction: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/reactions/{reaction_id}': {
      delete: {
        tags: ['반응'],
        summary: '반응 취소',
        parameters: [{ name: 'reaction_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '반응 취소 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '취소되었습니다.' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 북마크
    // ─────────────────────────────────────────
    '/api/bookmarks': {
      post: {
        tags: ['북마크'],
        summary: '북마크 추가',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['target_id', 'target_type'], properties: { target_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string', enum: ['course', 'spot'] } } } } },
        },
        responses: {
          201: {
            description: '북마크 추가 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { bookmark_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
      get: {
        tags: ['북마크'],
        summary: '북마크 목록 조회',
        parameters: [
          { name: 'target_type', in: 'query', schema: { type: 'string', enum: ['course', 'spot'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '북마크 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, bookmarks: { type: 'array', items: { type: 'object', properties: { bookmark_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string' }, target: { type: 'object' }, created_at: { type: 'string', format: 'date-time' } } } } } } } },
          },
        },
      },
    },
    '/api/bookmarks/{bookmark_id}': {
      delete: {
        tags: ['북마크'],
        summary: '북마크 해제',
        parameters: [{ name: 'bookmark_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '북마크 해제 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '해제되었습니다.' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 신고
    // ─────────────────────────────────────────
    '/api/reports': {
      post: {
        tags: ['신고'],
        summary: '신고 접수',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['target_id', 'target_type', 'report_category'], properties: { target_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string', enum: ['course', 'spot', 'review', 'user'] }, report_category: { type: 'string', example: 'dangerous' }, description: { type: 'string' } } } } },
        },
        responses: {
          201: {
            description: '신고 접수 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { report_id: { type: 'string', format: 'uuid' }, status: { type: 'string', example: 'pending' }, created_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    '/api/admin/reports': {
      get: {
        tags: ['신고'],
        summary: '신고 목록 조회 (관리자)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'processing', 'resolved', 'rejected'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: {
          200: {
            description: '신고 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, reports: { type: 'array', items: { type: 'object', properties: { report_id: { type: 'string', format: 'uuid' }, target_type: { type: 'string' }, report_category: { type: 'string' }, status: { type: 'string' }, created_at: { type: 'string', format: 'date-time' } } } } } } } },
          },
        },
      },
    },
    '/api/admin/reports/{report_id}': {
      patch: {
        tags: ['신고'],
        summary: '신고 처리 (관리자)',
        parameters: [{ name: 'report_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['processing', 'resolved', 'rejected'] }, admin_note: { type: 'string' } } } } },
        },
        responses: {
          200: {
            description: '신고 처리 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { report_id: { type: 'string', format: 'uuid' }, status: { type: 'string' }, updated_at: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 알림
    // ─────────────────────────────────────────
    '/api/notifications': {
      get: {
        tags: ['알림'],
        summary: '알림 목록 조회',
        parameters: [
          { name: 'is_read', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: {
          200: {
            description: '알림 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, notifications: { type: 'array', items: { type: 'object', properties: { notification_id: { type: 'string', format: 'uuid' }, message: { type: 'string' }, is_read: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } } } } } } } },
          },
        },
      },
    },
    '/api/notifications/{notification_id}/read': {
      patch: {
        tags: ['알림'],
        summary: '알림 읽음 처리',
        parameters: [{ name: 'notification_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '읽음 처리 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { notification_id: { type: 'string', format: 'uuid' }, is_read: { type: 'boolean', example: true } } } } },
          },
        },
      },
    },
  },
};

const options = {
  definition: swaggerDefinition,
  apis: [],
};

module.exports = swaggerJsdoc(options);
