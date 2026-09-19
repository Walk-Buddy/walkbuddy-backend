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
      url: 'https://api.gilbom.quest',
      description: '메인 배포 서버 (Main - 출시용)',
    },
    {
      url: 'https://contest.gilbom.quest',
      description: '공모전 배포 서버 (Contest)',
    },
    {
      url: 'http://localhost:3000',
      description: '로컬 개발 서버 (Local)',
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
      TourTrafficLog: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          at: { type: 'string', format: 'date-time' },
          api: { type: 'string', example: 'KorService2' },
          pathname: { type: 'string', example: 'searchFestival2' },
          params: { type: 'object', additionalProperties: true, description: '요청 파라미터 (serviceKey는 자동 마스킹되어 남지 않음)' },
          status: { type: 'string', enum: ['ok', 'error'] },
          httpStatus: { type: 'integer', nullable: true, example: 200 },
          resultCode: { type: 'string', nullable: true, example: '0000' },
          message: { type: 'string', nullable: true },
          durationMs: { type: 'integer', example: 140 },
          actor: { type: 'string', nullable: true },
        },
      },
      TourTrafficStats: {
        type: 'object',
        properties: {
          process_started_at: { type: 'string', format: 'date-time' },
          uptime_sec: { type: 'integer', example: 3600 },
          buffered: { type: 'integer', example: 42 },
          max_buffer: { type: 'integer', example: 1000 },
          last_call_at: { type: 'string', format: 'date-time', nullable: true },
          last_call_api: { type: 'string', nullable: true, example: 'KorService2/searchFestival2' },
          counters: {
            type: 'object',
            properties: {
              total: { type: 'integer', example: 120 },
              ok: { type: 'integer', example: 118 },
              error: { type: 'integer', example: 2 },
              byApi: { type: 'object', additionalProperties: { type: 'integer' }, example: { KorService2: 100, Durunubi: 20 } },
              byPath: { type: 'object', additionalProperties: { type: 'integer' }, example: { 'KorService2/searchFestival2': 5 } },
            },
          },
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
        summary: '카카오 소셜 로그인 (POST)',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string', description: '카카오 OAuth 인가코드 (?code= 값)' } } } } },
        },
        responses: {
          200: {
            description: '카카오 로그인 성공 (딥링크 리다이렉트 또는 토큰 반환)',
            content: { 'application/json': { schema: { type: 'object', properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, is_new_user: { type: 'boolean' }, user: { type: 'object', properties: { user_id: { type: 'string', format: 'uuid' }, email: { type: 'string' }, nickname: { type: 'string' } } } } } } },
          },
        },
      },
      get: {
        tags: ['로그인'],
        summary: '카카오 소셜 로그인 (GET 콜백)',
        description: '카카오 OAuth 인가코드 콜백을 수신하여 모바일 딥링크(walkbuddy://login-success?access_token=...&refresh_token=...)로 리다이렉트합니다.',
        security: [],
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' }, description: '카카오 OAuth 인가코드' },
        ],
        responses: {
          302: {
            description: '모바일 딥링크 리다이렉트',
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
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: '임시 비밀번호가 이메일로 발송되었습니다.' } } } } },
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
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: '로그아웃 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: '로그아웃 되었습니다.' } } } } },
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
       delete: {
        tags: ['회원'],
        summary: '회원 탈퇴 (소프트 딜리트)',
        description: '현재 로그인한 사용자의 계정을 탈퇴(소프트 딜리트) 처리합니다.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: '탈퇴 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '회원 탈퇴가 완료되었습니다.' },
                  },
                },
              },
            },
          },
          400: {
            description: '이미 탈퇴 처리된 계정',
          },
          401: {
            description: '인증 토큰 없음 또는 유효하지 않음',
          },
          404: {
            description: '사용자를 찾을 수 없음',
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
    '/api/users/me/history': {
      get: {
        tags: ['회원'],
        summary: '내 이용 기록 통합 조회 (마이페이지)',
        description: '산책 기록, 후기(코스/스팟), 내가 생성한 코스, 북마크(코스/스팟) 등 사용자의 모든 활동 이력을 최신순으로 통합 조회합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '이용 기록 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 45 },
                    page: { type: 'integer', example: 1 },
                    history: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          history_type: { type: 'string', enum: ['walk', 'course_review', 'spot_review', 'course_created', 'bookmark_course', 'bookmark_spot'], example: 'walk' },
                          item_id: { type: 'string', format: 'uuid' },
                          title: { type: 'string', example: '불암산 둘레길 산책' },
                          occurred_at: { type: 'string', format: 'date-time' },
                          detail: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/users/me/courses': {
      get: {
        tags: ['회원'],
        summary: '내가 등록한 코스 목록 조회 (마이페이지)',
        description: '현재 로그인한 사용자가 직접 생성한 코스 목록을 최신순으로 조회합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'is_public', in: 'query', schema: { type: 'boolean' }, description: '공개/비공개 코스 필터 (true: 공개, false: 비공개)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '내가 등록한 코스 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 5 },
                    page: { type: 'integer', example: 1 },
                    courses: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          course_id: { type: 'string', format: 'uuid' },
                          name: { type: 'string', example: '내가 만든 노원 힐링길' },
                          description: { type: 'string', nullable: true },
                          category: { type: 'string', nullable: true },
                          total_distance: { type: 'integer', example: 3500 },
                          estimated_duration: { type: 'integer', example: 2700 },
                          is_public: { type: 'boolean', example: true },
                          status: { type: 'string', example: 'active' },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/users/me/reviews': {
      get: {
        tags: ['회원'],
        summary: '내가 작성한 후기 목록 조회 (마이페이지)',
        description: '현재 로그인한 사용자가 작성한 코스 및 스팟 후기를 최신순으로 통합 조회합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '내가 작성한 후기 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer', example: 12 },
                    page: { type: 'integer', example: 1 },
                    reviews: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          review_type: { type: 'string', enum: ['course', 'spot'], example: 'course' },
                          review_id: { type: 'string', format: 'uuid' },
                          target_id: { type: 'string', format: 'uuid' },
                          target_name: { type: 'string', example: '불암산 나비정원 산책로' },
                          description: { type: 'string', nullable: true },
                          rating: { type: 'number', nullable: true, example: 5 },
                          difficulty: { type: 'string', nullable: true, example: 'easy' },
                          is_recommended: { type: 'boolean', nullable: true },
                          photos: { type: 'array', items: { type: 'string' }, nullable: true },
                          is_public: { type: 'boolean', example: true },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/users/blocks': {
      post: {
        tags: ['회원 - 차단'],
        summary: '사용자 차단',
        description: '특정 사용자를 차단 목록에 추가합니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['blocked_user_id'],
                properties: {
                  blocked_user_id: { type: 'string', format: 'uuid', description: '차단할 사용자 ID' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: '차단 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    block_id: { type: 'string', format: 'uuid' },
                    blocker_id: { type: 'string', format: 'uuid' },
                    blocked_id: { type: 'string', format: 'uuid' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: { description: '자기 자신 차단 불가 또는 잘못된 요청' },
          404: { description: '차단 대상 사용자 없음' },
          409: { description: '이미 차단한 사용자' },
        },
      },
      get: {
        tags: ['회원 - 차단'],
        summary: '내 차단 목록 조회',
        description: '내가 차단한 사용자 목록을 최신순으로 조회합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '차단 목록 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    blocks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          block_id: { type: 'string', format: 'uuid' },
                          created_at: { type: 'string', format: 'date-time' },
                          blocked_user: {
                            type: 'object',
                            properties: {
                              user_id: { type: 'string', format: 'uuid' },
                              nickname: { type: 'string' },
                              profile_image_url: { type: 'string', nullable: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/users/blocks/{blocked_user_id}': {
      delete: {
        tags: ['회원 - 차단'],
        summary: '사용자 차단 해제',
        description: '차단했던 사용자를 차단 해제합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'blocked_user_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '차단 해제 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '차단이 성공적으로 해제되었습니다.' },
                  },
                },
              },
            },
          },
          404: { description: '차단 내역을 찾을 수 없음' },
        },
      },
    },

    // ─────────────────────────────────────────
    // 태그
    // ─────────────────────────────────────────

    '/api/tags': {
      get: {
        tags: ['태그'],
        summary: '전체 태그 목록 조회 (계층형/그룹형)',
        description: '사용자가 선택할 수 있는 활성 태그 목록을 코스/스팟 태그 및 큰 태그(group_name: 열린관광, 반려동물, 시설·편의, 분위기·테마 등) 기준의 계층형 딕셔너리로 반환합니다. 프론트엔드에서 대분류 탭/아코디언 선택 후 세부 태그를 선택하는 UI 구성에 사용합니다.',
        security: [],
        responses: {
          200: {
            description: '태그 목록 (대분류-소분류 계층형 제공)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer', example: 35 },
                    course_count: { type: 'integer', example: 7 },
                    spot_count: { type: 'integer', example: 28 },
                    course_tags: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          tag_id: { type: 'string', format: 'uuid' },
                          name: { type: 'string', example: '추천산책로' },
                          type: { type: 'string', example: 'course' },
                          group_name: { type: 'string', example: '추천·테마' },
                          api_theme: { type: 'string', nullable: true, example: null, description: '전용 API 테마 (barrier-free, pet, null)' },
                        },
                      },
                    },
                    spot_tags: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          tag_id: { type: 'string', format: 'uuid' },
                          name: { type: 'string', example: '휠체어접근' },
                          type: { type: 'string', example: 'spot' },
                          group_name: { type: 'string', example: '열린관광' },
                          api_theme: { type: 'string', nullable: true, example: 'barrier-free', description: '전용 API 테마 (barrier-free, pet, null)' },
                        },
                      },
                    },
                    course_tags_by_group: {
                      type: 'object',
                      description: '대분류 그룹별로 묶인 코스 태그 목록 (api_theme 및 세부 tags 배열 포함)',
                      example: {
                        '추천·테마': {
                          api_theme: null,
                          tags: [{ tag_id: 'uuid', name: '추천산책로', type: 'course', group_name: '추천·테마', api_theme: null }],
                        },
                        '동반·접근성': {
                          api_theme: 'barrier-free',
                          tags: [{ tag_id: 'uuid', name: '무장애길', type: 'course', group_name: '동반·접근성', api_theme: 'barrier-free' }],
                        },
                      },
                    },
                    spot_tags_by_group: {
                      type: 'object',
                      description: '대분류 그룹별로 묶인 스팟 태그 목록 (api_theme 및 세부 tags 배열 포함)',
                      example: {
                        '열린관광': {
                          api_theme: 'barrier-free',
                          tags: [
                            { tag_id: 'uuid', name: '휠체어접근', type: 'spot', group_name: '열린관광', api_theme: 'barrier-free' },
                            { tag_id: 'uuid', name: '무단차통로', type: 'spot', group_name: '열린관광', api_theme: 'barrier-free' },
                          ],
                        },
                        '반려동물': {
                          api_theme: 'pet',
                          tags: [
                            { tag_id: 'uuid', name: '반려견동반', type: 'spot', group_name: '반려동물', api_theme: 'pet' },
                          ],
                        },
                        '시설·편의': {
                          api_theme: null,
                          tags: [
                            { tag_id: 'uuid', name: '화장실', type: 'spot', group_name: '시설·편의', api_theme: null },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 지역 (탐색 지원)
    // ─────────────────────────────────────────
    '/api/regions': {
      get: {
        tags: ['지역'],
        summary: '지원 지역 목록 조회 (전국 / 서울특별시 25개 구 / 강원특별자치도 춘천시)',
        description: '프론트엔드 지역 필터링 UI 구성을 위한 계층형 지역 목록을 반환합니다. 전국, 서울특별시(25개 구), 강원특별자치도(춘천시 및 권역)가 포함되어 있으며, 각 항목의 params 객체를 코스/스팟 조회 시 쿼리 파라미터로 그대로 전달할 수 있습니다.',
        security: [],
        responses: {
          200: {
            description: '지원 지역 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total_regions: { type: 'integer', example: 3 },
                    total_cities: { type: 'integer', example: 3 },
                    regions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'seoul' },
                          code: { type: 'string', example: 'seoul' },
                          name: { type: 'string', example: '서울특별시' },
                          fullName: { type: 'string', example: '서울특별시' },
                          params: {
                            type: 'object',
                            properties: {
                              region: { type: 'string', nullable: true, example: '서울' },
                              sub_region: { type: 'string', nullable: true, example: null },
                            },
                          },
                          sub_regions: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string', example: '강남구' },
                                code: { type: 'string', example: '강남구' },
                                params: {
                                  type: 'object',
                                  properties: {
                                    region: { type: 'string', nullable: true, example: '서울' },
                                    sub_region: { type: 'string', nullable: true, example: '강남구' },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    seoul_districts: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['강남구', '강동구', '강북구', '...25개 구'],
                    },
                    chuncheon_areas: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['의암호·공지천권', '소양강·신북권', '도심·명동권', '동면·구봉산권', '강촌·남산권'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 코스
    // ─────────────────────────────────────────
    '/api/courses/preview': {
      post: {
        tags: ['코스'],
        summary: '코스 미리보기 (거리/시간/경로 계산)',
        description: 'DB 저장 없이 경유지 목록(waypoints)을 전달받아 T맵 보행자 경로 API를 통해 GeoJSON LineString, 총 거리(m), 예상 소요 시간(초)을 실시간으로 계산해 반환합니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['waypoints'],
                properties: {
                  waypoints: {
                    type: 'array',
                    minItems: 2,
                    description: '경유지 목록 (최소 2개, spot 또는 pin 객체)',
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
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '미리보기 계산 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    geojson: { type: 'object', description: 'GeoJSON LineString Geometry' },
                    total_distance: { type: 'integer', example: 3200, description: '총 거리 (미터)' },
                    estimated_duration: { type: 'integer', example: 2880, description: '예상 소요 시간 (초)' },
                  },
                },
              },
            },
          },
          400: { description: 'waypoints 형식 오류 또는 최소 개수 미달' },
        },
      },
    },
    '/api/courses/from-walk': {
      post: {
        tags: ['코스'],
        summary: '산책 기록 기반 코스 생성',
        description: '완료된 산책 기록(walk_record_id)과 사용자가 지정한 경유지(waypoints)를 바탕으로 새로운 코스를 생성합니다.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['walk_record_id', 'name', 'waypoints'],
                properties: {
                  walk_record_id: { type: 'string', format: 'uuid', description: '산책 기록 ID' },
                  name: { type: 'string', example: '내가 걸었던 불암산 힐링코스' },
                  description: { type: 'string', nullable: true, example: '산책 후 등록한 코스' },
                  category: { type: 'string', nullable: true, example: '산책로' },
                  waypoints: {
                    type: 'array',
                    minItems: 2,
                    description: '선택한 경유지 목록',
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          required: ['type', 'spot_id'],
                          properties: {
                            type: { type: 'string', enum: ['spot'] },
                            spot_id: { type: 'string', format: 'uuid' },
                          },
                        },
                        {
                          type: 'object',
                          required: ['type', 'lat', 'lng'],
                          properties: {
                            type: { type: 'string', enum: ['pin'] },
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                          },
                        },
                      ],
                    },
                  },
                  tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  is_public: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: '코스 생성 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    course_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    region: { type: 'string' },
                    sub_region: { type: 'string', nullable: true },
                    total_distance: { type: 'integer' },
                    estimated_duration: { type: 'integer' },
                    is_public: { type: 'boolean' },
                    waypoints_count: { type: 'integer' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: { description: '필수 파라미터 누락 또는 waypoints 오류' },
          404: { description: '종료된 산책 기록을 찾을 수 없음' },
        },
      },
    },
    '/api/courses': {
      get: {
        tags: ['코스'],
        summary: '코스 목록 및 통합 검색/필터 조회',
        description: '공개 코스 목록을 조회하거나 키워드 검색, 다중 조건 필터링을 수행합니다. 키워드, 지역, 세부권역, 카테고리, 순환 여부, 난이도, 거리/소요시간/평점 범위, 태그 목록을 쿼리 스트링으로 자유롭게 조합할 수 있습니다.',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '코스명, 설명, 카테고리 키워드 검색 (q도 동일하게 사용 가능)' },
          { name: 'region', in: 'query', schema: { type: 'string' }, description: '시/도 지역 필터 (예: 서울, 춘천)' },
          { name: 'sub_region', in: 'query', schema: { type: 'string' }, description: '세부 자치구/권역 필터 (예: 노원구, 마포구, 의암호·공지천권)' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['둘레길·트레킹', '도심·골목산책', '수변·공원길'] }, description: '코스 표준 카테고리' },
          { name: 'is_cycle', in: 'query', schema: { type: 'boolean' }, description: '순환형(원점회귀) 여부 (true: 순환형, false: 편도형)' },
          { name: 'difficulty_level', in: 'query', schema: { type: 'integer', enum: [1, 2, 3] }, description: '난이도 숫자 필터 (1: 쉬움, 2: 보통, 3: 어려움)' },
          { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['easy', 'normal', 'medium', 'hard'] }, description: '후기 난이도 평균 기반 필터' },
          { name: 'min_total_distance', in: 'query', schema: { type: 'number' }, description: '최소 총 길이(m) (min_distance도 사용 가능)' },
          { name: 'max_total_distance', in: 'query', schema: { type: 'number' }, description: '최대 총 길이(m) (max_distance도 사용 가능)' },
          { name: 'min_estimated_duration', in: 'query', schema: { type: 'number' }, description: '최소 예상 소요 시간(분) (min_duration도 사용 가능)' },
          { name: 'max_estimated_duration', in: 'query', schema: { type: 'number' }, description: '최대 예상 소요 시간(분) (max_duration도 사용 가능)' },
          { name: 'min_avg_rating', in: 'query', schema: { type: 'number', minimum: 0, maximum: 5 }, description: '최소 평균 평점 (min_rating도 사용 가능)' },
          { name: 'tag_name', in: 'query', schema: { type: 'string' }, description: '코스 태그명 (예: 추천코스, 힐링, 반려동물, 무장애길)' },
          { name: 'course_tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 코스 태그 UUID 목록 (tag_ids도 사용 가능)' },
          { name: 'spot_tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 장소 태그 UUID 목록' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['latest', 'rating', 'length', 'distance_asc', 'distance_desc', 'duration', 'duration_asc', 'duration_desc'], default: 'latest' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '코스 목록 및 검색 결과',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer' },
                    total_count: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    filters: { type: 'object' },
                    courses: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          course_id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          description: { type: 'string' },
                          category: { type: 'string', example: '둘레길·트레킹' },
                          region: { type: 'string', example: '서울' },
                          sub_region: { type: 'string', example: '노원구', nullable: true },
                          total_distance: { type: 'integer' },
                          estimated_duration: { type: 'integer' },
                          is_cycle: { type: 'boolean', description: '순환형 여부' },
                          difficulty_level: { type: 'integer', description: '난이도 (1~3)' },
                          start_location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                          avg_rating: { type: 'number', nullable: true },
                          avg_difficulty_score: { type: 'number', nullable: true },
                          difficulty: { type: 'string', nullable: true },
                          review_count: { type: 'integer' },
                          course_tags: { type: 'array', items: { type: 'object' } },
                          spot_tags: { type: 'array', items: { type: 'object' } },
                          tags: { type: 'array', items: { type: 'object' } },
                          is_public: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
            },
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    course_id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', nullable: true },
                    region: { type: 'string' },
                    sub_region: { type: 'string', nullable: true },
                    route: { type: 'object' },
                    total_distance: { type: 'integer' },
                    estimated_duration: { type: 'integer' },
                    difficulty: { type: 'string' },
                    avg_rating: { type: 'number' },
                    avg_difficulty: { type: 'number', nullable: true },
                    review_count: { type: 'integer' },
                    waypoints: {
                      type: 'array',
                      description: '경유지(스팟/핀) 목록 (권장 필드)',
                      items: {
                        type: 'object',
                        properties: {
                          seq: { type: 'integer' },
                          type: { type: 'string', enum: ['spot', 'pin'] },
                          spot_id: { type: 'string', format: 'uuid', nullable: true },
                          lat: { type: 'number', nullable: true },
                          lng: { type: 'number', nullable: true },
                          spot_name: { type: 'string', nullable: true },
                          spot_lat: { type: 'number', nullable: true },
                          spot_lng: { type: 'number', nullable: true },
                          spot_categories: { type: 'array', nullable: true },
                          segment_duration: { type: 'integer', nullable: true },
                        },
                      },
                    },
                    spots: {
                      type: 'array',
                      description: '경유지 목록 (하위 호환용 alias, waypoints와 동일)',
                      items: { type: 'object' },
                    },
                    nearby_spots: { type: 'array', items: { type: 'object' } },
                    tags: { type: 'array', items: { type: 'object' } },
                    is_bookmarked: { type: 'boolean' },
                    is_public: { type: 'boolean' },
                  },
                },
              },
            },
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
    '/api/courses/{course_id}/photos': {
      get: {
        tags: ['코스'],
        summary: '코스 관련 사진 조회 (한국관광공사 사진 갤러리 API)',
        description: '한국관광공사 관광사진 정보(PhotoGalleryService1 galleryList1)를 실시간 호출하여 코스 이름 기반으로 관광 사진 목록을 조회합니다.',
        security: [],
        parameters: [
          { name: 'course_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '코스 고유 ID' },
        ],
        responses: {
          200: {
            description: '코스 사진 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    course_id: { type: 'string', format: 'uuid' },
                    course_name: { type: 'string', example: '불암산 둘레길' },
                    source: { type: 'string', example: 'PhotoGalleryService1.galleryList1' },
                    total_count: { type: 'integer', example: 5 },
                    photos: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string', example: '불암산 설경' },
                          image_url: { type: 'string', example: 'http://tong.visitkorea.or.kr/cms2/website/...' },
                          created_time: { type: 'string' },
                          photographer: { type: 'string', nullable: true },
                          location: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: '코스를 찾을 수 없음' },
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
        description: '키워드 또는 앱 스팟 카테고리, 지역(region) 기준으로 카카오 API 후보와 DB 저장 스팟을 함께 검색합니다. keyword 또는 q로 장소명·주소·설명 등을 검색할 수 있습니다. (온디바이스 모드: 사용자 좌표 대신 정적 스팟 좌표를 반환하여 기기에서 거리 계산)',
        security: [],
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '장소명, 주소, 설명 키워드 검색. q도 같은 의미로 사용할 수 있습니다.' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['산', '숲·휴양림', '수목원·정원', '강·하천', '호수·저수지', '계곡·폭포', '해수욕장·해변', '생태·서식지', '공원·광장'] }, description: '앱 기준 스팟 카테고리. keyword가 없으면 category가 필요합니다.' },
          { name: 'region', in: 'query', schema: { type: 'string' }, description: '지역명 필터 (예: 춘천시, 마포구, 노원구)' },
          { name: 'tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분한 스팟 태그 UUID 목록. 선택한 태그를 모두 가진 DB 저장 스팟만 saved_spots에 포함됩니다.' },
          { name: 'min_recommend_pct', in: 'query', schema: { type: 'number', minimum: 0, maximum: 100 }, description: 'DB 저장 스팟의 최소 추천도' },
        ],
        responses: {
          200: {
            description: '스팟 통합 검색 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, category: { type: 'string', example: '강·하천' }, filters: { type: 'object', properties: { tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, region: { type: 'string', nullable: true }, min_recommend_pct: { type: 'number', nullable: true } } }, raw_count: { type: 'integer', description: '카카오 API에서 받은 원본 document 개수' }, saved_count: { type: 'integer' }, kakao_candidate_count: { type: 'integer' }, total_count: { type: 'integer' }, saved_spots: { type: 'array', items: { type: 'object', properties: { spot_id: { type: 'string', format: 'uuid' }, kakao_place_id: { type: 'string', nullable: true }, name: { type: 'string' }, address: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, kakao_category_name: { type: 'string', nullable: true }, recommend_pct: { type: 'number', nullable: true }, x: { type: 'number' }, y: { type: 'number' }, tags: { type: 'array', items: { type: 'object', properties: { tag_id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } }, is_saved: { type: 'boolean', example: true }, has_app_data: { type: 'boolean', example: true }, filter_match: { type: 'string', example: 'matched' }, result_group: { type: 'string', example: 'saved_spot' } } } }, kakao_candidates: { type: 'array', items: { type: 'object', properties: { kakao_place_id: { type: 'string' }, name: { type: 'string' }, kakao_category_name: { type: 'string', nullable: true }, categories: { type: 'array', items: { type: 'string' } }, address: { type: 'string', nullable: true }, x: { type: 'string' }, y: { type: 'string' }, is_saved: { type: 'boolean', example: false }, has_app_data: { type: 'boolean', example: false }, tags: { type: 'array', items: { type: 'object' }, example: [] }, recommend_pct: { type: 'number', nullable: true }, filter_match: { type: 'string', enum: ['unknown', 'category_location_only'] }, result_group: { type: 'string', example: 'kakao_candidate' } } } }, spots: { type: 'array', items: { type: 'object' }, description: 'saved_spots와 kakao_candidates를 합친 배열' } } } } },
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
        summary: '카카오 스팟 저장/조회 및 관광공사 다각화 데이터 자동 결합',
        description: '사용자가 카카오 API 검색 결과에서 특정 장소를 선택했을 때 호출합니다. DB 저장 기준은 카카오 장소이며, 저장 후 같은 좌표 주변의 TourAPI(위치기반 관광정보, 무장애 관광정보 KorWithService2, 반려동물 동반여행 KorPetTourService2)를 전방위 결합합니다. 관광 개요(overview), 무장애 편의시설(barrier_free_info), 반려동물 규정 등을 분석하여 계층형 세부 태그(#휠체어접근, #무단차통로, #장애인화장실, #소형견동반 등)를 자동 부착합니다. TourAPI 보강 실패는 카카오 스팟 저장 실패로 처리하지 않습니다.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['kakao_place_id', 'name', 'categories', 'x', 'y'], properties: { kakao_place_id: { type: 'string', description: '카카오 Local API documents[].id' }, name: { type: 'string', description: '카카오 Local API documents[].place_name' }, kakao_category_name: { type: 'string', nullable: true, example: '여행 > 관광,명소 > 문화유적 > 탑,비석' }, categories: { type: 'array', items: { type: 'string' }, minItems: 1, description: '앱 기준 카테고리로 매핑되면 앱 카테고리, 매핑되지 않으면 카카오 category_name의 3번째 값, 없으면 2번째 값을 사용합니다. 예: 공원·광장, 문화유적' }, address: { type: 'string', nullable: true, description: '이미 정리된 주소. road_address_name이 없을 때 사용 가능' }, road_address_name: { type: 'string', nullable: true, description: '카카오 도로명 주소. 있으면 우선 저장' }, address_name: { type: 'string', nullable: true, description: '카카오 지번 주소. 도로명 주소가 없을 때 fallback' }, x: { type: 'number', description: '장소 경도(lng)' }, y: { type: 'number', description: '장소 위도(lat)' } } } } },
        },
        responses: {
          200: {
            description: '이미 저장된 스팟 반환 (새로운 관광공사 정보 및 태그 보강 적용)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    is_created: { type: 'boolean', example: false },
                    tour_content_enriched: { type: 'boolean', example: true, description: 'TourAPI 개요(overview) 보강 여부' },
                    barrier_free_enriched: { type: 'boolean', example: true, description: 'TourAPI 무장애 편의시설 정보 보강 여부' },
                    pet_tour_enriched: { type: 'boolean', example: true, description: 'TourAPI 반려동물 동반 정보 보강 여부' },
                    tour_content_status: { type: 'string', example: 'enriched', enum: ['enriched', 'matched_without_new_content', 'no_match_found', 'tour_api_error'] },
                    tour_content_match: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        content_id: { type: 'string', example: '126508' },
                        title: { type: 'string', example: '경복궁' },
                        distance: { type: 'number', example: 15.2, description: '카카오 좌표와 TourAPI 좌표 간 거리(m)' },
                      },
                    },
                    attached_tags: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['휠체어접근', '무단차통로', '장애인화장실', '소형견동반'],
                      description: '관광공사 데이터 분석을 통해 자동으로 부착된 계층형 세부 태그 목록',
                    },
                    spot: {
                      type: 'object',
                      properties: {
                        spot_id: { type: 'string', format: 'uuid' },
                        kakao_place_id: { type: 'string' },
                        name: { type: 'string' },
                        address: { type: 'string', nullable: true },
                        region: { type: 'string', example: '서울' },
                        sub_region: { type: 'string', example: '종로구', nullable: true },
                        categories: { type: 'array', items: { type: 'string' } },
                        kakao_category_name: { type: 'string', nullable: true },
                        recommend_pct: { type: 'number', nullable: true },
                        content_tour: { type: 'string', nullable: true, description: 'TourAPI 관광 해설 개요' },
                        barrier_free_info: {
                          type: 'object',
                          nullable: true,
                          description: '무장애(열린관광) 편의시설 상세 데이터',
                          example: {
                            wheelchair: '대여 가능',
                            restroom: '장애인 전용 화장실 구비',
                            parking: '장애인 전용 주차구역 완비',
                          },
                        },
                        x: { type: 'number' },
                        y: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          201: {
            description: '새 스팟 저장 완료 (새로운 관광공사 정보 및 태그 보강 적용)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    is_created: { type: 'boolean', example: true },
                    tour_content_enriched: { type: 'boolean', example: true },
                    barrier_free_enriched: { type: 'boolean', example: true },
                    pet_tour_enriched: { type: 'boolean', example: true },
                    tour_content_status: { type: 'string', example: 'enriched' },
                    tour_content_match: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        content_id: { type: 'string', example: '126508' },
                        title: { type: 'string', example: '경복궁' },
                        distance: { type: 'number', example: 15.2 },
                      },
                    },
                    attached_tags: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['휠체어접근', '무단차통로', '장애인화장실', '소형견동반'],
                    },
                    spot: {
                      type: 'object',
                      properties: {
                        spot_id: { type: 'string', format: 'uuid' },
                        kakao_place_id: { type: 'string' },
                        name: { type: 'string' },
                        address: { type: 'string', nullable: true },
                        region: { type: 'string', example: '서울' },
                        sub_region: { type: 'string', example: '종로구', nullable: true },
                        categories: { type: 'array', items: { type: 'string' } },
                        kakao_category_name: { type: 'string', nullable: true },
                        recommend_pct: { type: 'number', nullable: true },
                        content_tour: { type: 'string', nullable: true },
                        barrier_free_info: { type: 'object', nullable: true },
                        x: { type: 'number' },
                        y: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
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
        summary: '스팟 목록 및 통합 검색/필터 조회',
        description: 'DB에 저장된 스팟 목록을 조회하거나 키워드 검색, 다중 조건 필터링을 수행합니다. 키워드, 지역, 세부권역, 카테고리, 태그, 추천율 필터 및 정렬을 쿼리 스트링으로 조합할 수 있습니다.',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '스팟명, 주소, 세부권역 키워드 검색 (q도 동일하게 사용 가능)' },
          { name: 'region', in: 'query', schema: { type: 'string' }, description: '시/도 지역 필터 (예: 서울, 춘천)' },
          { name: 'sub_region', in: 'query', schema: { type: 'string' }, description: '세부 자치구/권역 필터 (예: 노원구, 마포구, 의암호·공지천권)' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['산·등산로', '숲·휴양림', '수목원·정원', '강·하천', '호수·저수지', '공원·광장', '역사·유적', '전시·문화공간', '카페·맛집', '전통시장·로컬마켓'] }, description: '스팟 10대 표준 카테고리' },
          { name: 'tag_name', in: 'query', schema: { type: 'string' }, description: '스팟 태그명 (예: 음성해설, 열린관광, 야간명소, 포토존, 전통·한옥, 낮그늘, 실시간축제, 반려견동반, 화장실, 주차가능, 벤치·쉼터)' },
          { name: 'tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표로 구분된 태그 UUID 목록' },
          { name: 'min_recommend_pct', in: 'query', schema: { type: 'number', minimum: 0, maximum: 100 }, description: '최소 추천율 (0~100)' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['latest', 'recommend', 'name'], default: 'latest' }, description: '정렬 기준 (latest: 최신순, recommend: 추천율순, name: 이름순)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '스팟 목록 및 검색 결과',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer' },
                    total_count: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    spots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          spot_id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          x: { type: 'number' },
                          y: { type: 'number' },
                          address: { type: 'string' },
                          region: { type: 'string', example: '서울' },
                          sub_region: { type: 'string', example: '노원구', nullable: true },
                          categories: { type: 'array', items: { type: 'string' } },
                          recommend_pct: { type: 'number' },
                          barrier_free_info: { type: 'object', nullable: true },
                          is_night_tour: { type: 'boolean' },
                          has_content_place: { type: 'boolean' },
                          has_content_history: { type: 'boolean' },
                          has_content_tour: { type: 'boolean' },
                          tags: { type: 'array', items: { type: 'object' } },
                        },
                      },
                    },
                  },
                },
              },
            },
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
    '/api/spots/{spot_id}/photos': {
      get: {
        tags: ['스팟'],
        summary: '스팟 관련 사진 조회 (한국관광공사 사진 갤러리 API)',
        description: '한국관광공사 관광사진 정보(PhotoGalleryService1 galleryList1)를 실시간 호출하여 스팟 이름 기반으로 관광 사진 목록을 조회합니다.',
        security: [],
        parameters: [
          { name: 'spot_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '스팟 고유 ID' },
        ],
        responses: {
          200: {
            description: '스팟 사진 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    spot_id: { type: 'string', format: 'uuid' },
                    spot_name: { type: 'string', example: '화랑대 철도공원' },
                    source: { type: 'string', example: 'PhotoGalleryService1.galleryList1' },
                    total_count: { type: 'integer', example: 4 },
                    photos: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string', example: '화랑대 철도공원 풍경' },
                          image_url: { type: 'string', example: 'http://tong.visitkorea.or.kr/cms2/website/...' },
                          created_time: { type: 'string' },
                          photographer: { type: 'string', nullable: true },
                          location: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: '스팟을 찾을 수 없음' },
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
            content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, walks: { type: 'array', items: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, course_name: { type: 'string' }, total_distance: { type: 'integer' }, is_completed: { type: 'boolean' }, map_image_url: { type: 'string', nullable: true }, started_at: { type: 'string', format: 'date-time' } } } } } } } },
          },
        },
      },
    },
    '/api/walks/{walk_record_id}/end': {
      patch: {
        tags: ['산책 진행'],
        summary: '산책 종료',
        description: '산책을 종료하고 통계를 저장합니다. 온디바이스(비신고) 모드에서는 GPS 궤적 전송 없이 total_distance, duration, is_completed 통계 요약값 및 지도 캡처 이미지 URL(map_image_url)을 전송합니다.',
        parameters: [{ name: 'walk_record_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  total_distance: { type: 'integer', description: '총 이동 거리(m)', example: 2800 },
                  duration: { type: 'integer', description: '총 소요 시간(분)', example: 42 },
                  is_completed: { type: 'boolean', description: '완주 여부', example: true },
                  map_image_url: { type: 'string', description: '산책 경로 지도 캡처 이미지 URL', example: 'https://walkbuddy-uploads-2026.s3.ap-northeast-2.amazonaws.com/walk-map-123.png' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '산책 종료',
            content: { 'application/json': { schema: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, total_distance: { type: 'integer' }, duration: { type: 'integer' }, is_completed: { type: 'boolean' }, map_image_url: { type: 'string', nullable: true }, ended_at: { type: 'string', format: 'date-time' } } } } },
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
            content: { 'application/json': { schema: { type: 'object', properties: { walk_record_id: { type: 'string', format: 'uuid' }, course: { type: 'object' }, total_distance: { type: 'integer' }, duration: { type: 'integer' }, is_completed: { type: 'boolean' }, map_image_url: { type: 'string', nullable: true } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 업로드 (S3 파일 업로드)
    // ─────────────────────────────────────────
    '/api/upload': {
      post: {
        tags: ['업로드'],
        summary: '단일 파일 S3 업로드',
        description: '이미지 파일 1장을 AWS S3 버킷에 업로드하고 S3 key를 반환합니다. (최대 5MB)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: '업로드할 이미지 파일 (JPG, PNG 등, 최대 5MB)',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '업로드 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '업로드 성공' },
                    key: { type: 'string', example: '1725284000000-profile.png', description: 'S3 객체 Key' },
                  },
                },
              },
            },
          },
          400: { description: '파일 누락 또는 용량 초과 (5MB 제한)' },
          500: { description: 'S3 업로드 서버 오류' },
        },
      },
    },
    '/api/upload/{key}': {
      get: {
        tags: ['업로드'],
        summary: '조회용 임시 URL 발급',
        description: 'Private S3 버킷에 저장된 파일 조회를 위한 Pre-signed URL을 발급합니다. (1시간 유효)',
        security: [],
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'S3 파일 Key (예: 1725284000000-profile.png 또는 reviews/1725...png)',
          },
        ],
        responses: {
          200: {
            description: '임시 URL 발급 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    url: {
                      type: 'string',
                      example: 'https://walkbuddy-uploads-2026.s3.ap-southeast-2.amazonaws.com/1725284000000-profile.png?...',
                      description: '1시간 동안 유효한 S3 다운로드/조회 URL',
                    },
                  },
                },
              },
            },
          },
          500: { description: 'URL 생성 실패 또는 존재하지 않는 파일' },
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
      409: {
        description: '이미 후기가 등록된 산책 기록',
        content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string', example: '이미 후기가 등록된 산책 기록입니다.' } } } } },
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
      content: { 'multipart/form-data': { schema: { type: 'object', required: ['walk_record_id'], properties: {
        walk_record_id: { type: 'string', format: 'uuid', description: '산책 기록 ID' },
        is_recommended: { type: 'boolean' },
        is_public: { type: 'boolean', default: true },
        description: { type: 'string' },
        tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        photos: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 5, description: '첨부 사진 파일 (최대 5장, 장당 5MB)' }
      } } } },
    },
    responses: {
      201: {
        description: '스팟 후기 등록 완료',
        content: { 'application/json': { schema: { type: 'object', properties: { spot_review_id: { type: 'string', format: 'uuid' }, spot_id: { type: 'string', format: 'uuid' }, is_recommended: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } } } } },
      },
      409: {
        description: '이미 후기가 등록된 산책 기록',
        content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string', example: '이미 해당 스팟에 후기가 등록된 산책 기록입니다.' } } } } },
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
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['target_id', 'target_type', 'reaction'],
                properties: {
                  target_id: { type: 'string', format: 'uuid', description: '후기 ID (course_review_id 또는 spot_review_id)' },
                  target_type: { type: 'string', enum: ['course_review', 'spot_review'], description: '반응 대상 유형' },
                  reaction: { type: 'string', enum: ['like', 'dislike'], description: '반응 종류' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: '반응 등록 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    target_id: { type: 'string', format: 'uuid' },
                    target_type: { type: 'string', example: 'course_review' },
                    reaction: { type: 'string', example: 'like' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: { description: '유효하지 않은 target_type 또는 reaction' },
        },
      },
    },
    '/api/reactions/{target_type}/{target_id}': {
      delete: {
        tags: ['반응'],
        summary: '반응 취소',
        description: '특정 후기(코스 후기 또는 스팟 후기)에 등록했던 좋아요/싫어요 반응을 취소(삭제)합니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'target_type', in: 'path', required: true, schema: { type: 'string', enum: ['course_review', 'spot_review'] }, description: '대상 유형' },
          { name: 'target_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '후기 고유 ID' },
        ],
        responses: {
          200: {
            description: '반응 취소 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: '취소되었습니다.' } } } } },
          },
          404: { description: '반응을 찾을 수 없음' },
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
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['target_type', 'target_id', 'reason'],
                properties: {
                  target_type: {
                    type: 'string',
                    enum: ['course', 'spot', 'course_review', 'spot_review', 'user'],
                    description: '신고 대상 구분 (코스, 스팟, 리뷰, 유저)',
                  },
                  target_id: {
                    type: 'string',
                    format: 'uuid',
                    description: '신고 대상 ID',
                  },
                  reason: {
                    type: 'string',
                    enum: [
                      'construction', 'blocked', 'dangerous', 'info_error',
                      'spam', 'abuse', 'inappropriate', 'false_info', 'portrait', 'etc'
                    ],
                    description: '신고 사유 코드 (환경 대상: construction/blocked/dangerous/info_error/etc, 유저/리뷰 대상: spam/abuse/inappropriate/false_info/portrait/etc)',
                  },
                  memo: {
                    type: 'string',
                    description: '신고 상세 설명 / 메모 (선택)',
                  },
                  photo_url: {
                    type: 'string',
                    description: '첨부 사진 URL (선택, 1장)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: '신고 접수 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    report_id: { type: 'string', format: 'uuid' },
                    target_type: { type: 'string' },
                    target_id: { type: 'string', format: 'uuid', nullable: true },
                    report_category: { type: 'string' },
                    reason: { type: 'string' },
                    memo: { type: 'string', nullable: true },
                    status: { type: 'string', example: 'received' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: { description: '요청 데이터 검증 실패' },
          401: { description: '인증 토큰 없음 또는 유효하지 않음' },
          404: { description: '신고 대상이 존재하지 않음' },
          409: { description: '이미 신고한 대상 (중복 신고)' },
        },
      },
    },
    '/api/reports/me': {
      get: {
        tags: ['신고'],
        summary: '내 신고 목록 조회',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['received', 'in_progress', 'completed', 'rejected'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '내 신고 목록 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    reports: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          report_id: { type: 'string', format: 'uuid' },
                          target_type: { type: 'string' },
                          target_id: { type: 'string', format: 'uuid', nullable: true },
                          report_category: { type: 'string' },
                          reason: { type: 'string' },
                          memo: { type: 'string', nullable: true },
                          photo_url: { type: 'string', nullable: true },
                          status: { type: 'string' },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/admin/reports': {
      get: {
        tags: ['관리자 - 신고'],
        summary: '신고 목록 조회 (관리자)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['received', 'in_progress', 'completed', 'rejected'] } },
          { name: 'report_category', in: 'query', schema: { type: 'string', enum: ['environment', 'user'] } },
          { name: 'target_type', in: 'query', schema: { type: 'string', enum: ['course', 'spot', 'course_review', 'spot_review', 'user'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: '신고 목록 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    reports: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          report_id: { type: 'string', format: 'uuid' },
                          reporter_id: { type: 'string', format: 'uuid', nullable: true },
                          reporter_nickname: { type: 'string', nullable: true },
                          target_type: { type: 'string' },
                          target_id: { type: 'string', format: 'uuid', nullable: true },
                          report_category: { type: 'string' },
                          reason: { type: 'string' },
                          memo: { type: 'string', nullable: true },
                          photo_url: { type: 'string', nullable: true },
                          status: { type: 'string' },
                          admin_memo: { type: 'string', nullable: true },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: '관리자 권한 없음' },
        },
      },
    },
    '/api/admin/reports/{report_id}': {
      get: {
        tags: ['관리자 - 신고'],
        summary: '신고 상세 조회 (관리자)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'report_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '신고 상세 정보 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    report_id: { type: 'string', format: 'uuid' },
                    reporter: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        user_id: { type: 'string', format: 'uuid' },
                        nickname: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    target_type: { type: 'string' },
                    target_id: { type: 'string', format: 'uuid', nullable: true },
                    target_details: { type: 'object', nullable: true, description: '신고 대상 콘텐츠/유저 요약 정보' },
                    report_category: { type: 'string' },
                    reason: { type: 'string' },
                    memo: { type: 'string', nullable: true },
                    photo_url: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    admin_memo: { type: 'string', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          403: { description: '관리자 권한 없음' },
          404: { description: '신고 내역을 찾을 수 없음' },
        },
      },
      patch: {
        tags: ['관리자 - 신고'],
        summary: '신고 처리 (관리자)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'report_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['in_progress', 'completed', 'rejected'],
                    description: '변경할 상태 (처리중, 완료, 반려)',
                  },
                  action: {
                    type: 'string',
                    enum: ['none', 'hide_target', 'suspend_user'],
                    default: 'none',
                    description: '대상 제재 조치 (hide_target: 콘텐츠 숨김, suspend_user: 유저 정지)',
                  },
                  admin_memo: {
                    type: 'string',
                    description: '관리자 처리 사유 / 메모 (선택)',
                  },
                  notify: {
                    type: 'boolean',
                    default: true,
                    description: '신고자에게 처리 결과 알림 발송 여부',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '신고 처리 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    report_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string' },
                    admin_memo: { type: 'string', nullable: true },
                    action_applied: { type: 'string' },
                    notification_created: { type: 'boolean' },
                    updated_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: { description: '유효하지 않은 상태값 또는 조치' },
          403: { description: '관리자 권한 없음' },
          404: { description: '신고 내역을 찾을 수 없음' },
        },
      },
    },

    // ─────────────────────────────────────────
    // 알림 (설계 단계 / 라우터 미연결)
    // ─────────────────────────────────────────
    // ─────────────────────────────────────────
    // 관리자 - 공공데이터 OpenAPI 실시간 트래픽 로그
    // ─────────────────────────────────────────
    '/api/admin/tour-traffic': {
      get: {
        tags: ['관리자 - 트래픽 로그'],
        summary: 'OpenAPI 실시간 트래픽 로그 조회 (관리자)',
        description: '앱이 공공데이터포털(관광공사 TourAPI·무장애·반려동물·관광사진·두루누비·Odii)을 실시간 호출한 내역(최신순)과 누적 통계를 반환합니다. serviceKey는 로그에서 자동 마스킹됩니다. 메모리 버퍼 기반이라 프로세스 재시작 시 초기화됩니다.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: '최근 로그 개수 (1~1000)' },
          { name: 'api', in: 'query', schema: { type: 'string', example: 'KorService2' }, description: '서비스 구분 필터' },
          { name: 'pathname', in: 'query', schema: { type: 'string', example: 'searchFestival2' }, description: '오퍼레이션 필터' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ok', 'error'] }, description: '성공/실패 필터' },
        ],
        responses: {
          200: {
            description: '로그 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    stats: { $ref: '#/components/schemas/TourTrafficStats' },
                    logs: { type: 'array', items: { $ref: '#/components/schemas/TourTrafficLog' } },
                  },
                },
              },
            },
          },
          401: { description: '인증 실패' },
          403: { description: '관리자 권한 없음' },
        },
      },
      delete: {
        tags: ['관리자 - 트래픽 로그'],
        summary: '트래픽 로그 버퍼 비우기 (관리자)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: '버퍼 비우기 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '트래픽 버퍼를 비웠습니다.' },
                  },
                },
              },
            },
          },
          403: { description: '관리자 권한 없음' },
        },
      },
    },
    '/api/admin/tour-traffic/stats': {
      get: {
        tags: ['관리자 - 트래픽 로그'],
        summary: 'OpenAPI 누적 통계 조회 (관리자)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: '통계 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    process_started_at: { type: 'string', format: 'date-time' },
                    uptime_sec: { type: 'integer', example: 3600 },
                    buffered: { type: 'integer', example: 42 },
                    max_buffer: { type: 'integer', example: 1000 },
                    last_call_at: { type: 'string', format: 'date-time', nullable: true },
                    last_call_api: { type: 'string', nullable: true, example: 'KorService2/searchFestival2' },
                    counters: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        ok: { type: 'integer' },
                        error: { type: 'integer' },
                        byApi: { type: 'object', additionalProperties: { type: 'integer' } },
                        byPath: { type: 'object', additionalProperties: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: '관리자 권한 없음' },
        },
      },
    },
    '/api/admin/tour-traffic/stream': {
      get: {
        tags: ['관리자 - 트래픽 로그'],
        summary: 'OpenAPI 실시간 트래픽 스트림 (SSE, 관리자)',
        description: 'Server-Sent Events(text/event-stream)로 OpenAPI 호출을 실시간 전송합니다. 연결 직후 event: stats 1회, 이후 호출마다 event: call 이벤트가 전송됩니다. 15초마다 ping 주석으로 연결을 유지합니다.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'SSE 스트림',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  example: 'event: call\\ndata: {"id":1,"api":"KorService2","pathname":"searchFestival2","status":"ok","durationMs":140}\\n\\n',
                },
              },
            },
          },
          403: { description: '관리자 권한 없음' },
        },
      },
    },

    '/api/notifications': {
      get: {
        tags: ['알림 (설계중)'],
        summary: '알림 목록 조회 (미구현)',
        description: '현재 라우터가 비활성화된 상태의 설계 API입니다.',
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
        tags: ['알림 (설계중)'],
        summary: '알림 읽음 처리 (미구현)',
        description: '현재 라우터가 비활성화된 상태의 설계 API입니다.',
        parameters: [{ name: 'notification_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: '읽음 처리 완료',
            content: { 'application/json': { schema: { type: 'object', properties: { notification_id: { type: 'string', format: 'uuid' }, is_read: { type: 'boolean', example: true } } } } },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 한국관광공사 두루누비 정보 서비스 (실시간 연동)
    // ─────────────────────────────────────────
    '/api/tour/durunubi/courses': {
      get: {
        tags: ['관광정보 - 두루누비 (실시간)'],
        summary: '두루누비 코스 목록 실시간 조회',
        description: '한국관광공사_두루누비 정보 서비스(B551011/Durunubi courseList)를 실시간으로 호출하여 지역별 걷기 코스 목록을 조회합니다. (공모전 실시간 트래픽 집계 충족)',
        security: [],
        parameters: [
          { name: 'region', in: 'query', required: true, schema: { type: 'string', default: '서울' }, description: '지역명 (예: 서울, 강남구, 노원구, 춘천)' },
          { name: 'brdDiv', in: 'query', schema: { type: 'string' }, description: '코스 구분 코드 (선택, 빈 값이면 전체)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '두루누비 코스 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer', example: 15 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 10 },
                    region: { type: 'string', example: '서울' },
                    region_full: { type: 'string', example: '서울특별시' },
                    durunubi_sigun: { type: 'string', example: '서울' },
                    courses: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          crs_idx: { type: 'string', example: 'T_CRS_MNG_2022000001' },
                          crs_kod: { type: 'string' },
                          crs_name: { type: 'string', example: '서울둘레길 1코스 수락·불암산코스' },
                          crs_level: { type: 'string', example: '3' },
                          crs_distance: { type: 'string', example: '18.6km' },
                          crs_time: { type: 'string', example: '8시간 30분' },
                          sigun: { type: 'string', example: '서울' },
                          image_url: { type: 'string', nullable: true },
                          summary: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'region 파라미터 누락 또는 지원하지 않는 지역' },
        },
      },
    },
    '/api/tour/durunubi/courses/{crs_idx}': {
      get: {
        tags: ['관광정보 - 두루누비 (실시간)'],
        summary: '두루누비 코스 상세 실시간 조회',
        description: '한국관광공사 두루누비 정보 서비스(courseDetail)를 실시간 호출하여 특정 코스의 상세 소개, 경로(GPX), 여행 팁 등을 조회합니다.',
        security: [],
        parameters: [
          { name: 'crs_idx', in: 'path', required: true, schema: { type: 'string' }, description: '두루누비 코스 고유 ID' },
        ],
        responses: {
          200: {
            description: '두루누비 코스 상세 정보',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    course: {
                      type: 'object',
                      properties: {
                        crs_idx: { type: 'string' },
                        crs_kod: { type: 'string' },
                        crs_name: { type: 'string' },
                        crs_level: { type: 'string' },
                        crs_distance: { type: 'string' },
                        crs_time: { type: 'string' },
                        crs_cycle: { type: 'string', nullable: true },
                        sigun: { type: 'string' },
                        summary: { type: 'string', nullable: true },
                        contents: { type: 'string', nullable: true },
                        tour_info: { type: 'string', nullable: true },
                        traveler_info: { type: 'string', nullable: true },
                        image_url: { type: 'string', nullable: true },
                        gpx: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'crs_idx 누락' },
          404: { description: '코스 정보를 찾을 수 없음' },
        },
      },
    },
    '/api/tour/durunubi/courses/{crs_idx}/spots': {
      get: {
        tags: ['관광정보 - 두루누비 (실시간)'],
        summary: '두루누비 코스 내 스팟 목록 실시간 조회',
        description: '한국관광공사 두루누비 정보 서비스(courseSpotList)를 실시간 호출하여 해당 코스에 포함된 경유지(스팟) 목록을 조회합니다.',
        security: [],
        parameters: [
          { name: 'crs_idx', in: 'path', required: true, schema: { type: 'string' }, description: '두루누비 코스 고유 ID' },
        ],
        responses: {
          200: {
            description: '코스 스팟 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    crs_idx: { type: 'string' },
                    total: { type: 'integer' },
                    spots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          spot_idx: { type: 'string' },
                          spot_name: { type: 'string' },
                          spot_address: { type: 'string', nullable: true },
                          x: { type: 'number', nullable: true },
                          y: { type: 'number', nullable: true },
                          image_url: { type: 'string', nullable: true },
                          spot_type: { type: 'string', nullable: true },
                          order_no: { type: 'integer', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'crs_idx 누락' },
        },
      },
    },

    // ─────────────────────────────────────────
    // 한국관광공사 TourAPI 4.0 실시간 연동 (공모전 트래픽 검증용)
    // ─────────────────────────────────────────
    '/api/tour/festivals': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '서울(노원구) / 춘천 실시간 축제·행사 조회',
        description: '한국관광공사 TourAPI searchFestival1 오퍼레이션을 실시간 호출하여 현재 진행 중인 축제/행사를 조회합니다.',
        parameters: [
          { name: 'region', in: 'query', schema: { type: 'string', default: 'nowon' }, description: '지역명 (nowon, chuncheon, 노원구, 춘천시)' },
          { name: 'eventStartDate', in: 'query', schema: { type: 'string', example: '20260901' }, description: '조회 시작일 (YYYYMMDD 형식, 기본값: 오늘)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '실시간 축제 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    region: { type: 'string', example: '노원구' },
                    festivals: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          content_id: { type: 'string' },
                          title: { type: 'string' },
                          address: { type: 'string' },
                          event_start_date: { type: 'string' },
                          event_end_date: { type: 'string' },
                          image_url: { type: 'string', nullable: true },
                          tel: { type: 'string', nullable: true },
                          x: { type: 'number' },
                          y: { type: 'number' },
                          region: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/spots': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 지역/테마/위치별 관광지 목록 조회',
        description: '한국관광공사 TourAPI areaBasedList2 및 locationBasedList2 오퍼레이션을 실시간 호출하여 인기순/거리순 관광지 목록을 조회합니다. 위치 반경, 카테고리, 태그, 추천도 필터를 적용할 수 있습니다.',
        parameters: [
          { name: 'region', in: 'query', schema: { type: 'string', default: 'chuncheon' }, description: '지역명 (춘천, 서울, 노원구, 강남구 등)' },
          { name: 'sub_region', in: 'query', schema: { type: 'string' }, description: '세부 권역 또는 자치구명' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: '장소 유형 필터 (예: 카페, 음식점, 공원·광장, 산·등산로, 전시·문화공간 등)' },
          { name: 'tag_ids', in: 'query', schema: { type: 'string' }, description: '쉼표 구분 태그 UUID 목록' },
          { name: 'min_recommend_pct', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 100 }, description: '최소 추천도 (0–100)' },
          { name: 'latitude', in: 'query', schema: { type: 'number' }, description: '사용자 위치 위도 (반경 검색 시)' },
          { name: 'longitude', in: 'query', schema: { type: 'number' }, description: '사용자 위치 경도 (반경 검색 시)' },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 3000 }, description: '검색 반경 (미터 단위, 기본 3000m, 최대 20000m)' },
          { name: 'contentTypeId', in: 'query', schema: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'] }, description: '관광타입 (12:관광지, 14:문화시설, 15:축제, 28:레포츠, 38:쇼핑, 39:음식점)' },
          { name: 'cat1', in: 'query', schema: { type: 'string' }, description: '대분류 (A01:자연, A02:인문, A03:레포츠, A04:쇼핑, A05:음식)' },
          { name: 'cat2', in: 'query', schema: { type: 'string' }, description: '중분류 (A0101, A0201, A0206 등)' },
          { name: 'cat3', in: 'query', schema: { type: 'string' }, description: '소분류' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '실시간 관광지 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer', example: 120 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 10 },
                    region: { type: 'string', example: '춘천시' },
                    spots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          content_id: { type: 'string', example: '128001' },
                          content_type_id: { type: 'string', example: '12' },
                          title: { type: 'string', example: '남이섬' },
                          address: { type: 'string', example: '강원특별자치도 춘천시 남산면 남이섬길 1' },
                          image_url: { type: 'string', nullable: true },
                          tel: { type: 'string', nullable: true },
                          x: { type: 'number', example: 127.5255 },
                          y: { type: 'number', example: 37.7912 },
                          cat1: { type: 'string', nullable: true },
                          cat2: { type: 'string', nullable: true },
                          cat3: { type: 'string', nullable: true },
                          region: { type: 'string', example: '춘천' },
                          categories: { type: 'array', items: { type: 'string' }, example: ['공원·광장'] },
                          recommend_pct: { type: 'number', nullable: true, example: 95.0 },
                          tags: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                tag_id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/search': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 관광지 키워드 검색',
        description: '한국관광공사 TourAPI searchKeyword1 오퍼레이션을 실시간 호출하여 키워드로 관광지를 검색합니다.',
        parameters: [
          { name: 'keyword', in: 'query', required: true, schema: { type: 'string', example: '불암산' }, description: '검색 키워드' },
          { name: 'region', in: 'query', schema: { type: 'string' }, description: '지역 필터 (nowon, chuncheon)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '검색 결과',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, total: { type: 'integer' }, spots: { type: 'array', items: { type: 'object' } } } } } },
          },
        },
      },
    },

    '/api/tour/spots/{content_id}/detail': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 관광지 상세정보 및 갤러리 이미지 조회',
        description: '한국관광공사 TourAPI detailCommon1 및 detailImage1을 실시간 호출하여 스토리텔링 개요와 고해상도 갤러리 이미지를 제공합니다.',
        parameters: [
          { name: 'content_id', in: 'path', required: true, schema: { type: 'string', example: '126508' }, description: '한국관광공사 contentId' },
        ],
        responses: {
          200: {
            description: '상세정보 및 사진 갤러리',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    spot: {
                      type: 'object',
                      properties: {
                        content_id: { type: 'string' },
                        title: { type: 'string' },
                        overview: { type: 'string', description: '스토리텔링 개요 (음성해설 원천 데이터)' },
                        homepage: { type: 'string', nullable: true },
                        tel: { type: 'string', nullable: true },
                        address: { type: 'string' },
                        images: { type: 'array', items: { type: 'object', properties: { image_url: { type: 'string' }, small_image_url: { type: 'string' }, image_name: { type: 'string' } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/spots/{content_id}/barrier-free': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 열린관광(무장애 관광) 5대 약자 편의시설 정보 조회',
        description: '한국관광공사 무장애 여행 정보(KorWithService2) detailWithTour2 오퍼레이션을 실시간 호출하여 지체장애, 시각장애, 청각장애, 영유아 동반 부모, 대중교통 등 5대 항목별 편의시설 정보를 제공합니다.',
        parameters: [
          { name: 'content_id', in: 'path', required: true, schema: { type: 'string', example: '126508' }, description: '한국관광공사 contentId' },
        ],
        responses: {
          200: {
            description: '무장애 편의시설 상세 정보',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    barrier_free: {
                      type: 'object',
                      properties: {
                        content_id: { type: 'string' },
                        has_barrier_free_info: { type: 'boolean' },
                        summary_tags: { type: 'array', items: { type: 'string' }, example: ['#열린관광', '#주차가능', '#화장실', '#음성해설'] },
                        details: {
                          type: 'object',
                          properties: {
                            physical: { type: 'object', description: '지체장애/휠체어 이동 편의 (주차구역, 경사로, 휠체어대여, 엘리베이터 등)' },
                            visual: { type: 'object', description: '시각장애 편의 (점자블록, 보조견동반, 음성안내기 등)' },
                            hearing: { type: 'object', description: '청각장애 편의 (수어안내, 영상자막 등)' },
                            infant: { type: 'object', description: '영유아 동반 가족 편의 (유모차대여, 수유실 등)' },
                            general: { type: 'object', description: '대중교통 및 공통 편의' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/barrier-free/spots': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 지역별 열린관광(무장애 인증) 스팟 목록 조회',
        description: '한국관광공사 무장애 여행 정보(KorWithService2) areaBasedList2 오퍼레이션을 실시간 호출하여 서울(25개 구) / 춘천 지역의 무장애 인증 관광지 목록을 반환합니다. (LBS 미신고 100% 준수: GPS 대신 region 파라미터 사용)',
        parameters: [
          { name: 'region', in: 'query', schema: { type: 'string', example: 'nowon' }, description: '타겟 지역 (seoul, nowon, gangnam, chuncheon 등)' },
          { name: 'contentTypeId', in: 'query', schema: { type: 'string', example: '12' }, description: '관광타입 (12:관광지, 14:문화시설, 15:축제, 28:레포츠, 38:쇼핑, 39:음식점)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '무장애 스팟 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    region: { type: 'string' },
                    spots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          content_id: { type: 'string' },
                          title: { type: 'string' },
                          address: { type: 'string' },
                          image_url: { type: 'string', nullable: true },
                          x: { type: 'number' },
                          y: { type: 'number' },
                          is_barrier_free: { type: 'boolean', example: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/barrier-free/search': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 열린관광(무장애) 키워드 검색',
        description: '한국관광공사 무장애 여행 정보(KorWithService2) searchKeyword2 오퍼레이션을 실시간 호출하여 무장애 관광지를 검색합니다.',
        parameters: [
          { name: 'keyword', in: 'query', required: true, schema: { type: 'string', example: '공원' }, description: '검색할 키워드' },
          { name: 'region', in: 'query', schema: { type: 'string', example: 'seoul' }, description: '타겟 지역 (서울 25개 구 / 춘천)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '검색 결과',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer' },
                    keyword: { type: 'string' },
                    spots: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/spots/{content_id}/pet': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 스팟별 반려동물 동반 상세 정보 조회 (KorPetTourService2)',
        description: '한국관광공사 반려동물 동반여행 서비스(KorPetTourService2) detailPetTour2 오퍼레이션을 실시간 호출하여 동반 가능 크기, 비치 품목, 주의사항 등을 조회합니다.',
        parameters: [
          { name: 'content_id', in: 'path', required: true, schema: { type: 'string', example: '2654601' }, description: '한국관광공사 contentId' },
        ],
        responses: {
          200: {
            description: '반려동물 동반 정보 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    pet_tour: {
                      type: 'object',
                      properties: {
                        content_id: { type: 'string', example: '2654601' },
                        has_pet_info: { type: 'boolean', example: true },
                        summary_tags: { type: 'array', items: { type: 'string' }, example: ['#반려견동반'] },
                        details: {
                          type: 'object',
                          properties: {
                            pet_tour_info: { type: 'string', nullable: true },
                            accident_risk: { type: 'string', nullable: true },
                            accompany_type: { type: 'string', example: '일부구역 동반가능' },
                            facilities: { type: 'string', nullable: true },
                            furnished_items: { type: 'string', nullable: true },
                            purchasable_items: { type: 'string', nullable: true },
                            rentable_items: { type: 'string', nullable: true },
                            allowed_pet_size: { type: 'string', example: '전 견종 동반 가능' },
                            recommend_pet_pattern: { type: 'string', nullable: true },
                            extra_fee: { type: 'string', nullable: true },
                            etc_info: { type: 'string', example: '- 맹견의 경우, 입마개 착용 필수\n- 배변봉투 지참 및 배변처리 필수' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/pet/spots': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 지역별 반려동물 동반 가능 스팟 목록 조회 (LBS 미신고 안전)',
        description: '스마트폰 GPS 대신 사용자가 선택한 지역(서울 25개 구 / 춘천) 파라미터만 받아 한국관광공사 KorPetTourService2 areaBasedList2를 실시간 호출합니다.',
        parameters: [
          { name: 'region', in: 'query', schema: { type: 'string', default: 'nowon' }, description: '지역 (서울 25개 구: nowon, gangnam 등 / chuncheon)' },
          { name: 'contentTypeId', in: 'query', schema: { type: 'string' }, description: '관광타입 (선택: 12:관광지, 14:문화시설, 28:레포츠, 38:쇼핑, 39:음식점)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '목록 조회 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer', example: 1 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 10 },
                    region: { type: 'string', example: '노원구' },
                    spots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          content_id: { type: 'string', example: '2654601' },
                          content_type_id: { type: 'string', example: '12' },
                          title: { type: 'string', example: '화랑대 철도공원' },
                          address: { type: 'string', example: '서울특별시 노원구 화랑로 608 (공릉동)' },
                          image_url: { type: 'string', nullable: true },
                          tel: { type: 'string', nullable: true },
                          x: { type: 'number', example: 127.093106 },
                          y: { type: 'number', example: 37.624505 },
                          region: { type: 'string', example: '노원구' },
                          is_pet_friendly: { type: 'boolean', example: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/tour/pet/search': {
      get: {
        tags: ['관광공사 TourAPI (실시간)'],
        summary: '실시간 반려동물 동반 가능 관광지 키워드 검색',
        description: '한국관광공사 KorPetTourService2 searchKeyword2 오퍼레이션을 실시간 호출하여 반려동물 동반 가능 장소를 검색합니다.',
        parameters: [
          { name: 'keyword', in: 'query', required: true, schema: { type: 'string', example: '공원' }, description: '검색 키워드' },
          { name: 'region', in: 'query', schema: { type: 'string', example: 'chuncheon' }, description: '지역 필터 (선택: seoul, chuncheon 등)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: '검색 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    total: { type: 'integer', example: 8 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 10 },
                    keyword: { type: 'string', example: '공원' },
                    spots: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
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
