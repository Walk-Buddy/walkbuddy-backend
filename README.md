# 🐾 WalkBuddy

> 나만의 산책 코스를 만들고, 스팟을 발견하고, 기록하는 산책 메이트 서비스

---

## 📌 프로젝트 소개

WalkBuddy는 사용자가 직접 산책 코스를 등록하고 공유할 수 있는 산책 기록 서비스입니다.
주변 스팟을 탐색하고, 산책을 시작부터 종료까지 기록하며, AI가 생성한 스팟 콘텐츠도 만나볼 수 있습니다.

- 코스 등록 / 검색 / 북마크
- 실시간 산책 기록 (GPS 경로 저장)
- 스팟 탐색 및 후기
- 카카오 소셜 로그인
- AI 기반 스팟 콘텐츠 제공

---

## 🛠 기술 스택

| 분류 | 기술 |
|------|------|
| Runtime | Node.js |
| Framework | Express |
| Database | PostgreSQL (PostGIS) |
| 인증 | JWT |
| API 문서 | Swagger (OpenAPI 3.0) |
| 외부 API | Kakao Local API, TourAPI, Gemini AI, T Map, Google TTS |

---

## 환경변수

TourAPI 관광 설명 보강을 사용하려면 `.env`에 아래 값을 추가합니다.

```env
TOUR_API_SERVICE_KEY=공공데이터포털_일반_인증키
TOUR_API_MOBILE_OS=ETC
TOUR_API_MOBILE_APP=WalkBuddy
TOUR_API_MATCH_RADIUS=300
```

기존 `.env`에 `TOURAPI_SERVICE_KEY` 이름으로 저장해둔 경우도 백엔드에서 함께 인식합니다.

`TOUR_API_MATCH_RADIUS`는 카카오 장소 좌표 주변에서 TourAPI 후보를 찾는 반경이며, 단위는 m입니다.

---

## 🔗 API 문서

[http://43.200.171.53:3000/api-docs](http://43.200.171.53:3000/api-docs)
