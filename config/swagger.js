const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// ─────────────────────────────────────────────────────────────────────
//  Swagger 설정
//  접속: http://localhost:3000/api-docs
// ─────────────────────────────────────────────────────────────────────

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WalkBuddy API',
      version: '1.0.0',
      description: '도보 코스 생성 및 GPS 기록 API',
    },
    servers: [
      { url: 'http://localhost:3000', description: '로컬 개발 서버' },
    ],
    components: {
      schemas: {

        // ── Node ─────────────────────────────────────────────────────
        PinCreate: {
          type: 'object',
          required: ['latitude', 'longitude'],
          properties: {
            latitude:  { type: 'number', example: 37.5665 },
            longitude: { type: 'number', example: 126.9780 },
            label:     { type: 'string', example: '출발지' },
            userId:    { type: 'string', format: 'uuid' },
          },
        },
        SpotCreate: {
          type: 'object',
          required: ['name', 'latitude', 'longitude'],
          properties: {
            name:          { type: 'string', example: '경복궁' },
            description:   { type: 'string' },
            latitude:      { type: 'number', example: 37.5796 },
            longitude:     { type: 'number', example: 126.9770 },
            contentTypes:  { type: 'object' },
            userId:        { type: 'string', format: 'uuid' },
          },
        },

        // ── Course ───────────────────────────────────────────────────
        CourseCreate: {
          type: 'object',
          required: ['title'],
          properties: {
            title:        { type: 'string', example: '서울 도심 산책' },
            description:  { type: 'string' },
            creationType: { type: 'string', enum: ['manual', 'auto'], default: 'manual' },
            userId:       { type: 'string', format: 'uuid' },
          },
        },
        CourseManualCreate: {
          type: 'object',
          required: ['title', 'pins'],
          properties: {
            title:       { type: 'string', example: '서울 도심 산책' },
            description: { type: 'string' },
            userId:      { type: 'string', format: 'uuid' },
            pins:        { type: 'array', items: { type: 'string', format: 'uuid' }, description: '핀 nodeId 배열 (순서대로)' },
            spots:       { type: 'array', items: { type: 'string', format: 'uuid' }, description: '스팟 nodeId 배열' },
          },
        },

        // ── 공통 ─────────────────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
      },
    },

    paths: {

      // ── Pins ────────────────────────────────────────────────────────
      '/api/pins': {
        get: {
          tags: ['Pins'],
          summary: '전체 핀 목록 조회',
          responses: { 200: { description: '성공' } },
        },
        post: {
          tags: ['Pins'],
          summary: '핀 생성',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PinCreate' } } } },
          responses: { 201: { description: '생성 성공' }, 400: { description: '필수 파라미터 누락' } },
        },
      },
      '/api/pins/{nodeId}': {
        get: {
          tags: ['Pins'],
          summary: '핀 단건 조회',
          parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '성공' }, 404: { description: '핀 없음' } },
        },
        put: {
          tags: ['Pins'],
          summary: '핀 수정',
          parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PinCreate' } } } },
          responses: { 200: { description: '수정 성공' }, 404: { description: '핀 없음' } },
        },
        delete: {
          tags: ['Pins'],
          summary: '핀 삭제',
          parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '삭제 성공' }, 404: { description: '핀 없음' } },
        },
      },

      // ── Spots ───────────────────────────────────────────────────────
      '/api/spots/pins': {
        get: {
          tags: ['Spots'],
          summary: '지도 범위 내 스팟 핀 좌표 반환',
          parameters: [
            { name: 'lat',    in: 'query', required: true,  schema: { type: 'number' } },
            { name: 'lng',    in: 'query', required: true,  schema: { type: 'number' } },
            { name: 'radius', in: 'query', required: false, schema: { type: 'number' }, description: '반경 km (기본 1)' },
          ],
          responses: { 200: { description: '성공', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { spotId: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' } } } } } } } },
        },
      },
      '/api/spots/{spotId}': {
        get: {
          tags: ['Spots'],
          summary: '스팟 상세 조회',
          parameters: [{ name: 'spotId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '성공' }, 404: { description: '스팟 없음' } },
        },
        put: {
          tags: ['Spots'],
          summary: '스팟 수정',
          parameters: [{ name: 'spotId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SpotCreate' } } } },
          responses: { 200: { description: '수정 성공' }, 404: { description: '스팟 없음' } },
        },
        delete: {
          tags: ['Spots'],
          summary: '스팟 삭제 (soft delete)',
          parameters: [{ name: 'spotId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '삭제 성공' }, 404: { description: '스팟 없음' } },
        },
      },
      '/api/spots': {
        post: {
          tags: ['Spots'],
          summary: '스팟 등록',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SpotCreate' } } } },
          responses: { 201: { description: '등록 성공', content: { 'application/json': { schema: { type: 'object', properties: { spotId: { type: 'string' } } } } } }, 400: { description: '필수 파라미터 누락' } },
        },
      },

      // ── Courses ─────────────────────────────────────────────────────
      '/api/courses': {
        get: {
          tags: ['Courses'],
          summary: '코스 목록 조회',
          responses: { 200: { description: '성공' } },
        },
      },
      '/api/courses/manual': {
        post: {
          tags: ['Courses'],
          summary: '코스 등록 (수동) - 핀 경로 + 스팟 포함',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseManualCreate' } } } },
          responses: { 201: { description: '등록 성공', content: { 'application/json': { schema: { type: 'object', properties: { courseId: { type: 'string', format: 'uuid' } } } } } }, 400: { description: '필수 파라미터 누락' } },
        },
      },
      '/api/courses/{courseId}': {
        get: {
          tags: ['Courses'],
          summary: '코스 상세 조회 (핀 포함)',
          parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '성공' }, 404: { description: '코스 없음' } },
        },
        put: {
          tags: ['Courses'],
          summary: '코스 수정',
          parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseCreate' } } } },
          responses: { 200: { description: '수정 성공' }, 404: { description: '코스 없음' } },
        },
        delete: {
          tags: ['Courses'],
          summary: '코스 삭제 (soft delete)',
          parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: '삭제 성공' }, 404: { description: '코스 없음' } },
        },
      },
      '/api/courses/{courseId}/pins': {
        post: {
          tags: ['Courses'],
          summary: '코스에 핀 추가',
          parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nodeId'], properties: { nodeId: { type: 'string', format: 'uuid' } } } } } },
          responses: { 201: { description: '추가 성공' } },
        },
      },
      '/api/courses/{courseId}/pins/{nodeId}': {
        delete: {
          tags: ['Courses'],
          summary: '코스에서 핀 제거',
          parameters: [
            { name: 'courseId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'nodeId',   in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 200: { description: '제거 성공' }, 404: { description: '연결 없음' } },
        },
      },

      // ── Routes (경로 계산) ───────────────────────────────────────────
      '/api/routes/calculate': {
        post: {
          tags: ['Routes'],
          summary: '핀 좌표 배열 기반 도보 경로 및 거리 계산',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pins'],
                  properties: {
                    pins: {
                      type: 'array',
                      items: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                      example: [{ lat: 37.5665, lng: 126.9780 }, { lat: 37.5700, lng: 126.9820 }],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '성공',
              content: { 'application/json': { schema: { type: 'object', properties: { distance: { type: 'number', example: 2.5 }, estimatedMinutes: { type: 'integer', example: 37 }, polyline: { type: 'array', items: { type: 'object' } } } } } },
            },
            400: { description: '핀 2개 미만' },
          },
        },
      },
      '/api/routes/detect-spots': {
        post: {
          tags: ['Routes'],
          summary: '경로 폴리라인 기반 주변 스팟 자동 감지',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['polyline'],
                  properties: {
                    polyline: {
                      type: 'array',
                      items: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                    },
                    radiusKm: { type: 'number', default: 0.05, description: '감지 반경 km (기본 50m)' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '성공',
              content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { spotId: { type: 'string' }, name: { type: 'string' }, dist: { type: 'number', description: '경로와의 거리 (m)' } } } } } },
            },
            400: { description: 'polyline 없음' },
          },
        },
      },

      // ── Walks (GPS 기록 - 코스 자동 생성) ───────────────────────────
      '/api/walks/tracking/start': {
        post: {
          tags: ['Walks'],
          summary: 'GPS 경로 기록 세션 생성',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } } } },
          },
          responses: { 201: { description: '성공', content: { 'application/json': { schema: { type: 'object', properties: { trackingId: { type: 'string', format: 'uuid' } } } } } } },
        },
      },
      '/api/walks/tracking/{id}/loc': {
        post: {
          tags: ['Walks'],
          summary: '실시간 GPS 좌표 업로드 (주기적 전송)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['coordinates'],
                  properties: {
                    coordinates: {
                      type: 'array',
                      items: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                      example: [{ lat: 37.5665, lng: 126.9780 }],
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: '성공', content: { 'application/json': { schema: { type: 'object', properties: { currentDist: { type: 'number', example: 0.5 } } } } } } },
        },
      },
      '/api/walks/tracking/{id}/spots': {
        post: {
          tags: ['Walks'],
          summary: '이동 중 스팟 즉시 등록',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SpotCreate' } } } },
          responses: { 201: { description: '등록 성공', content: { 'application/json': { schema: { type: 'object', properties: { spotId: { type: 'string', format: 'uuid' } } } } } } },
        },
      },
      '/api/walks/tracking/{id}/stop': {
        post: {
          tags: ['Walks'],
          summary: 'GPS 경로 기록 종료 및 코스 저장',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title:       { type: 'string', example: '오늘의 산책 코스' },
                    description: { type: 'string' },
                    userId:      { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: '성공', content: { 'application/json': { schema: { type: 'object', properties: { courseId: { type: 'string', format: 'uuid' } } } } } }, 400: { description: '진행 중 기록 없음' } },
        },
      },
    },
  },
  apis: [],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };