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
            content: { 'application/json': { schema: { type: 'object', properties: { verified: { type: 'boolean', example: true } } } } },
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
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'nickname'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, nickname: { type: 'string' } } } } },
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
          content: { 'application/json': { schema: { type: 'object', required: ['kakao_access_token'], properties: { kakao_access_token: { type: 'string' } } } } },
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
        summary: '태그 목록 조회',
        responses: {
          200: {
            description: '태그 목록',
            content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string', example: '#자연' }, type: { type: 'string', example: 'course' } } } } } } } },
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
        description: '기준 좌표 반경 안의 공개 코스를 거리/시간, 후기 기반 난이도·평점, 코스 태그, 포함 스팟 태그로 검색합니다. x는 경도, y는 위도입니다.',
        parameters: [
          { name: 'x', in: 'query', required: true, schema: { type: 'number' }, description: '기준 경도(lng)' },
          { name: 'y', in: 'query', required: true, schema: { type: 'number' }, description: '기준 위도(lat)' },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 5000 }, description: '검색 반경(m)' },
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
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, filters: { type: 'object' }, total_count: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, courses: { type: 'array', items: { type: 'object', properties: { course_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, total_distance: { type: 'integer' }, estimated_duration: { type: 'integer' }, distance: { type: 'number' }, avg_rating: { type: 'number', nullable: true }, avg_difficulty_score: { type: 'number', nullable: true }, difficulty: { type: 'string', nullable: true }, review_count: { type: 'integer' }, course_tags: { type: 'array', items: { type: 'object' } }, spot_tags: { type: 'array', items: { type: 'object' } }, is_public: { type: 'boolean' } } } } } } } },
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
          content: { 'application/json': { schema: { type: 'object', required: ['name', 'route'], properties: { name: { type: 'string' }, description: { type: 'string' }, route: { type: 'object' }, spots: { type: 'array', items: { type: 'string', format: 'uuid' } }, tags: { type: 'array', items: { type: 'string', format: 'uuid' } }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, is_public: { type: 'boolean' } } } } },
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
          content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string', format: 'uuid' } }, difficulty: { type: 'string' }, is_public: { type: 'boolean' } } } } },
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
          content: { 'application/json': { schema: { type: 'object', required: ['rating'], properties: { rating: { type: 'number', minimum: 0, maximum: 5 }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string', format: 'uuid' } }, difficulty: { type: 'string' } } } } },
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
          content: { 'application/json': { schema: { type: 'object', required: ['is_recommended'], properties: { is_recommended: { type: 'boolean' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string', format: 'uuid' } }, images: { type: 'array', items: { type: 'string' } } } } } },
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
