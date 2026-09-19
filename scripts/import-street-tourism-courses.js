require('dotenv').config();

const axios = require('axios');
const pool = require('../config/db');
const spotService = require('../services/spotService');
const {
  extractRegionFromAddress,
  inferSpotCategoriesWithFallback,
} = require('../constants/spotCategoryRules');

const API_BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_stret_tursm_info_api';
const DATA_SOURCE = '행정안전부_전국길관광정보표준데이터';
const COURSE_TAG_NAME = '관광코스';
const DEFAULT_PAGE_SIZE = 100;

// CLI 옵션 파싱
const args = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  const match = args.find((a) => a.startsWith(`--${prefix}=`));
  if (match) return match.split('=')[1];
  return fallback;
}
const isDryRun = args.includes('--dry-run');
const withSpots = !args.includes('--no-spots'); // 기본적으로 스팟 등록 활성화
const targetRegionArg = (getArg('region', process.env.STREET_TOURISM_REGION || 'all')).toLowerCase();
const limitArg = Number.parseInt(getArg('limit', process.env.STREET_TOURISM_LIMIT || '0'), 10);

const serviceKey =
  process.env.TOURAPI_SERVICE_KEY ||
  process.env.TOUR_API_SERVICE_KEY ||
  process.env.DURUNUBI_SERVICE_KEY;

const kakaoKey = process.env.KAKAO_REST_API_KEY;
const tmapKey = process.env.TMAP_API_KEY;

function requireEnv() {
  if (!serviceKey) {
    throw new Error('TOURAPI_SERVICE_KEY(또는 TOUR_API_SERVICE_KEY)가 .env에 설정되지 않았습니다.');
  }
}

// ──────────────────────────────────────────────────────────
// 1. 공공데이터 API 호출
// ──────────────────────────────────────────────────────────
async function fetchPage(pageNo) {
  const url = `${API_BASE_URL}?serviceKey=${encodeURIComponent(serviceKey)}&type=json&pageNo=${pageNo}&numOfRows=${DEFAULT_PAGE_SIZE}`;
  try {
    const res = await axios.get(url, { timeout: 30000 });
    const header = res.data?.header || res.data?.response?.header;
    const body = res.data?.body || res.data?.response?.body;

    if (header && header.resultCode !== '00' && header.resultCode !== '0000') {
      throw new Error(`API 호출 실패: [${header.resultCode}] ${header.resultMsg}`);
    }

    const raw = body?.items?.item || [];
    const items = Array.isArray(raw) ? raw : [raw];
    return {
      totalCount: Number(body?.totalCount || 0),
      items: items.filter(Boolean),
    };
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('전국길관광정보 API 인증 실패: 서비스 키를 확인해주세요.');
    }
    throw err;
  }
}

async function fetchAllStreetTourismItems() {
  console.log('📡 전국길관광정보표준데이터 API 데이터 수집 시작...');
  const first = await fetchPage(1);
  const totalCount = first.totalCount || first.items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));
  const allItems = [...first.items];

  console.log(`총 ${totalCount}건의 데이터 확인 (${totalPages}페이지)`);

  for (let page = 2; page <= totalPages; page += 1) {
    const p = await fetchPage(page);
    allItems.push(...p.items);
  }

  return allItems;
}

// ──────────────────────────────────────────────────────────
// 2. 지역 및 권역 필터링 (서울, 춘천)
// ──────────────────────────────────────────────────────────
function filterTargetItems(items) {
  return items.filter((item) => {
    const text = [
      item.insttNm,
      item.institutionNm,
      item.beginRdnmadr,
      item.beginLnmadr,
      item.endRdnmadr,
      item.endLnmadr,
      item.stretNm,
      item.coursInfo,
    ]
      .filter(Boolean)
      .join(' ');

    const isSeoul = text.includes('서울');
    const isChuncheon = text.includes('춘천');

    if (targetRegionArg === 'seoul') return isSeoul;
    if (targetRegionArg === 'chuncheon') return isChuncheon;
    return isSeoul || isChuncheon;
  });
}

const SEOUL_GU_LIST = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구',
  '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구',
  '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'
];

function resolveCourseRegion(item) {
  const text = [
    item.beginRdnmadr,
    item.beginLnmadr,
    item.insttNm,
    item.institutionNm,
    item.stretNm,
    item.endRdnmadr,
    item.endLnmadr,
    item.coursInfo,
  ]
    .filter(Boolean)
    .join(' ');

  // 1. 춘천
  if (text.includes('춘천')) {
    let sub = null;
    if (text.includes('의암') || text.includes('공지천') || text.includes('삼천동') || text.includes('근화동') || text.includes('칠전동')) {
      sub = '의암호·공지천권';
    } else if (text.includes('소양') || text.includes('신북') || text.includes('사북') || text.includes('우두') || text.includes('신사우')) {
      sub = '소양강·신북권';
    } else if (text.includes('구봉산') || text.includes('동면') || text.includes('만천') || text.includes('장학')) {
      sub = '동면·구봉산권';
    } else if (text.includes('강촌') || text.includes('남산') || text.includes('남면') || text.includes('김유정') || text.includes('신동면') || text.includes('구곡')) {
      sub = '강촌·남산권';
    } else if (text.includes('명동') || text.includes('중앙로') || text.includes('효자') || text.includes('퇴계') || text.includes('석사') || text.includes('온의') || text.includes('약사')) {
      sub = '도심·명동권';
    } else {
      sub = '도심·명동권';
    }
    return { region: '춘천', sub_region: sub };
  }

  // 2. 서울 (25개 구 정확 일치 우선)
  for (const gu of SEOUL_GU_LIST) {
    if (text.includes(gu)) {
      return { region: '서울', sub_region: gu };
    }
  }

  const fallback = extractRegionFromAddress(text);
  return {
    region: '서울',
    sub_region: fallback?.sub_region || null,
  };
}

// ──────────────────────────────────────────────────────────
// 3. 지오코딩 및 카카오 스팟 후보 탐색
// ──────────────────────────────────────────────────────────
const placeCache = new Map();

async function searchKakaoPlace(spotName, region, subRegion, addr) {
  if (!kakaoKey) return null;
  const cacheKey = `${region}:${subRegion || ''}:${spotName || ''}:${addr || ''}`;
  if (placeCache.has(cacheKey)) return placeCache.get(cacheKey);

  const queries = [];
  if (spotName) {
    if (subRegion) queries.push(`${region} ${subRegion} ${spotName}`);
    queries.push(`${region} ${spotName}`);
    queries.push(spotName);
  }
  if (addr) queries.push(addr);

  // 1. 키워드 검색
  for (const q of queries) {
    try {
      const res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        params: { query: q.trim(), size: 3 },
        timeout: 5000,
      });
      const docs = res.data?.documents || [];
      if (docs.length > 0) {
        const doc = docs[0];
        const categories = inferSpotCategoriesWithFallback(doc.category_name, doc.place_name);
        const result = {
          kakao_place_id: String(doc.id),
          name: doc.place_name,
          kakao_category_name: doc.category_name || null,
          categories: categories.length > 0 ? categories : ['자연·힐링'],
          address: doc.road_address_name || doc.address_name || null,
          x: Number(doc.x),
          y: Number(doc.y),
          region,
          sub_region: subRegion,
        };
        placeCache.set(cacheKey, result);
        return result;
      }
    } catch (_) {}
  }

  // 2. 주소 검색 (폴백)
  if (addr) {
    try {
      const res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        params: { query: addr.trim() },
        timeout: 5000,
      });
      const doc = res.data?.documents?.[0];
      if (doc?.x && doc?.y) {
        const result = {
          kakao_place_id: null,
          name: spotName || addr,
          kakao_category_name: null,
          categories: ['자연·힐링'],
          address: doc.road_address_name || doc.address_name || addr,
          x: Number(doc.x),
          y: Number(doc.y),
          region,
          sub_region: subRegion,
        };
        placeCache.set(cacheKey, result);
        return result;
      }
    } catch (_) {}
  }

  placeCache.set(cacheKey, null);
  return null;
}

// ──────────────────────────────────────────────────────────
// 4. 경로(LineString) 생성 (Tmap 도보 경로 연동)
// ──────────────────────────────────────────────────────────
function parseDurationMinutes(reqreTime, distanceM) {
  if (!reqreTime || typeof reqreTime !== 'string') {
    return Math.max(1, Math.ceil(distanceM / 67));
  }

  let minutes = 0;
  const hourMatch = reqreTime.match(/(\d+)\s*시간/);
  const minMatch = reqreTime.match(/(\d+)\s*분/);

  if (hourMatch) minutes += Number.parseInt(hourMatch[1], 10) * 60;
  if (minMatch) minutes += Number.parseInt(minMatch[1], 10);

  if (minutes > 0) return minutes;

  const num = Number.parseFloat(reqreTime.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(num) && num > 0) {
    return Math.round(num * 60);
  }

  return Math.max(1, Math.ceil(distanceM / 67));
}

async function fetchTmapPedestrianRoute(from, to) {
  if (!tmapKey) return null;

  try {
    const res = await axios.post(
      'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1',
      {
        startX: String(from.lng),
        startY: String(from.lat),
        endX: String(to.lng),
        endY: String(to.lat),
        startName: '출발',
        endName: '도착',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0',
      },
      {
        headers: {
          appKey: tmapKey,
          'Content-Type': 'application/json',
        },
        timeout: 7000,
      }
    );

    const coords = [];
    const features = res.data?.features || [];
    for (const f of features) {
      if (f.geometry?.type === 'LineString') {
        for (const [lng, lat] of f.geometry.coordinates) {
          coords.push({ lng, lat });
        }
      }
    }
    return coords.length >= 2 ? coords : null;
  } catch (_) {
    return null;
  }
}

async function buildCourseRoute(waypointsList) {
  const points = waypointsList.map((w) => ({ lat: w.lat, lng: w.lng }));
  if (points.length === 0) return null;

  if (points.length === 1) {
    points.push({
      lat: points[0].lat + 0.0004,
      lng: points[0].lng + 0.0004,
    });
  }

  const finalCoords = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];

    let tmapSegment = null;
    if (tmapKey) {
      tmapSegment = await fetchTmapPedestrianRoute(p1, p2);
    }

    if (tmapSegment && tmapSegment.length > 0) {
      finalCoords.push(...tmapSegment);
    } else {
      finalCoords.push(p1, p2);
    }
  }

  const MAX_POINTS = 1200;
  let sampled = finalCoords;
  if (finalCoords.length > MAX_POINTS) {
    sampled = [];
    const lastIdx = finalCoords.length - 1;
    for (let i = 0; i < MAX_POINTS; i += 1) {
      const srcIdx = Math.round((i * lastIdx) / (MAX_POINTS - 1));
      sampled.push(finalCoords[srcIdx]);
    }
  }

  const wkt = `SRID=4326;LINESTRING(${sampled.map((p) => `${p.lng} ${p.lat}`).join(', ')})`;
  return { wkt, points: sampled };
}

// ──────────────────────────────────────────────────────────
// 5. DB 삽입 및 관리자 확인
// ──────────────────────────────────────────────────────────
async function ensureAdminUser(client) {
  const { rows: admins } = await client.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`
  );
  if (admins.length) return admins[0].user_id;

  const { rows: seedAdmins } = await client.query(
    `SELECT user_id FROM users WHERE social_provider = 'seed' AND social_id = 'public-admin' LIMIT 1`
  );
  if (seedAdmins.length) return seedAdmins[0].user_id;

  const { rows: created } = await client.query(
    `INSERT INTO users (nickname, social_provider, social_id, role, status)
     VALUES ('공공데이터관리', 'seed', 'public-admin', 'admin', 'active')
     RETURNING user_id`
  );
  return created[0].user_id;
}

async function ensureCourseTag(client) {
  const { rows } = await client.query(
    `INSERT INTO tags (name, type, group_name, is_active)
     VALUES ($1, 'course', '추천·테마', TRUE)
     ON CONFLICT (name, type)
     DO UPDATE SET is_active = TRUE
     RETURNING tag_id`,
    [COURSE_TAG_NAME]
  );
  return rows[0].tag_id;
}

function buildCourseDescription(item) {
  const parts = [];
  if (item.stretIntrcn) parts.push(item.stretIntrcn.trim());
  if (item.coursInfo) parts.push(`📌 경유 경로: ${item.coursInfo.trim()}`);
  if (item.beginSpotNm || item.endSpotNm) {
    parts.push(`🚩 출발: ${item.beginSpotNm || '미지정'} / 도착: ${item.endSpotNm || '미지정'}`);
  }
  if (item.reqreTime) parts.push(`⏱️ 소요 시간: ${item.reqreTime.trim()}`);
  if (item.institutionNm) parts.push(`🏛️ 관리 기관: ${item.institutionNm.trim()}`);
  if (item.phoneNumber) parts.push(`📞 문의 전화: ${item.phoneNumber.trim()}`);

  return parts.join('\n\n') || null;
}

async function insertCourseWaypoints(client, courseId, waypointsList) {
  await client.query(`DELETE FROM course_waypoints WHERE course_id = $1`, [courseId]);

  for (let i = 0; i < waypointsList.length; i += 1) {
    const w = waypointsList[i];
    const seq = i + 1;

    if (w.spotId) {
      await client.query(
        `INSERT INTO course_waypoints (course_id, seq, type, spot_id, lat, lng)
         VALUES ($1, $2, 'spot', $3, NULL, NULL)`,
        [courseId, seq, w.spotId]
      );
    } else {
      await client.query(
        `INSERT INTO course_waypoints (course_id, seq, type, spot_id, lat, lng)
         VALUES ($1, $2, 'pin', NULL, $3, $4)`,
        [courseId, seq, w.lat, w.lng]
      );
    }
  }
}

// ──────────────────────────────────────────────────────────
// 6. 메인 실행 함수
// ──────────────────────────────────────────────────────────
async function main() {
  requireEnv();

  console.log(`🚀 [전국길관광정보 표준데이터] 코스 및 스팟 적재 프로세스 시작`);
  console.log(`- 대상 지역: ${targetRegionArg.toUpperCase()}`);
  console.log(`- 경유지 스팟 등록: ${withSpots ? 'ON (TourAPI 관광정보 연동)' : 'OFF (단순 핀 좌표만)'}`);
  console.log(`- 드라이런 모드: ${isDryRun ? 'ON (DB 저장 안함)' : 'OFF (DB 직접 적재)'}`);
  if (limitArg > 0) console.log(`- 제한 수량: ${limitArg}개`);

  const allItems = await fetchAllStreetTourismItems();
  let targetItems = filterTargetItems(allItems);

  console.log(`\n🔍 서울 및 춘천 필터링 결과: 총 ${targetItems.length}건 발굴`);

  if (limitArg > 0) {
    targetItems = targetItems.slice(0, limitArg);
    console.log(`- 제한 적용 후: ${targetItems.length}건 처리 예정`);
  }

  const client = isDryRun ? null : await pool.connect();
  let ownerId = null;
  let tagId = null;

  if (client) {
    ownerId = await ensureAdminUser(client);
    tagId = await ensureCourseTag(client);
  }

  const stats = {
    total: targetItems.length,
    success: 0,
    spotsSaved: 0,
    tourEnriched: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    for (let i = 0; i < targetItems.length; i += 1) {
      const item = targetItems[i];
      const courseName = (item.stretNm || '').trim();
      const sourceId = `${item.insttCode || 'INST'}_${courseName.replace(/[\s/]/g, '_')}`;

      console.log(`\n-------------------------------------------------------------`);
      console.log(`[${i + 1}/${targetItems.length}] 코스: "${courseName}"`);

      if (!courseName) {
        console.log('❌ [스킵] 코스명 없음');
        stats.skipped += 1;
        continue;
      }

      const { region, sub_region } = resolveCourseRegion(item);
      console.log(`📍 권역: ${region} (${sub_region || '기본권역'})`);

      // 경유 지점 후보군 추출
      const spotCandidates = [];

      // 1. 출발지
      if (item.beginSpotNm || item.beginRdnmadr || item.beginLnmadr) {
        spotCandidates.push({
          name: item.beginSpotNm,
          addr: item.beginRdnmadr || item.beginLnmadr,
          role: 'start',
        });
      }

      // 2. 중간 경유지들 (coursInfo 파싱)
      if (item.coursInfo) {
        const intermediateNames = item.coursInfo
          .split(/[→\->,>~]+/g)
          .map((s) => s.trim())
          .filter((s) => s && s.length >= 2 && !s.includes('종착지') && !s.includes('출발'));

        // 중간 경유지는 주요 명소 최대 5개 선택
        const selectedNames = intermediateNames.length <= 5
          ? intermediateNames
          : [
              intermediateNames[0],
              intermediateNames[Math.floor(intermediateNames.length * 0.25)],
              intermediateNames[Math.floor(intermediateNames.length * 0.5)],
              intermediateNames[Math.floor(intermediateNames.length * 0.75)],
              intermediateNames[intermediateNames.length - 1],
            ];

        for (const name of selectedNames) {
          // 출발지/도착지와 중복되지 않도록 방어
          if (name !== item.beginSpotNm && name !== item.endSpotNm) {
            spotCandidates.push({ name, addr: null, role: 'waypoint' });
          }
        }
      }

      // 3. 도착지
      if (item.endSpotNm || item.endRdnmadr || item.endLnmadr) {
        spotCandidates.push({
          name: item.endSpotNm,
          addr: item.endRdnmadr || item.endLnmadr,
          role: 'end',
        });
      }

      // 각 후보 장소를 지오코딩 및 스팟 DB 저장 (with TourAPI 연동)
      const courseWaypointsList = [];

      for (const cand of spotCandidates) {
        const place = await searchKakaoPlace(cand.name, region, sub_region, cand.addr);
        if (!place) continue;

        let spotId = null;

        // 스팟 등록 모드이고 카카오 장소 ID가 있는 정식 장소인 경우
        if (withSpots && place.kakao_place_id && !isDryRun && client) {
          try {
            const saved = await spotService.saveKakaoSpot(place, ownerId);
            if (saved.spot?.spot_id) {
              spotId = saved.spot.spot_id;
              stats.spotsSaved += saved.is_created ? 1 : 0;
              if (saved.tour_content_enriched) {
                stats.tourEnriched += 1;
                console.log(`  🌟 [스팟+TourAPI 매칭] ${place.name} -> 관광설명 & 무장애정보 연동`);
              } else {
                console.log(`  🏢 [스팟 등록] ${place.name} (${place.categories.join(',')})`);
              }
            }
          } catch (err) {
            // 스팟 저장 실패 시 핀 좌표로 폴백
          }
        } else if (isDryRun && place.kakao_place_id) {
          console.log(`  🔎 [스팟 후보] ${place.name} (좌표: ${place.x}, ${place.y})`);
        }

        // 연속 동일 좌표 방지
        const last = courseWaypointsList[courseWaypointsList.length - 1];
        if (last && Math.abs(last.lat - place.y) < 1e-6 && Math.abs(last.lng - place.x) < 1e-6) {
          continue;
        }

        courseWaypointsList.push({
          name: place.name,
          lat: place.y,
          lng: place.x,
          spotId,
        });
      }

      if (courseWaypointsList.length === 0) {
        console.log('❌ [스킵] 코스 좌표를 식별할 수 없습니다.');
        stats.skipped += 1;
        continue;
      }

      // 보행 경로(LineString) 생성
      const route = await buildCourseRoute(courseWaypointsList);
      if (!route) {
        console.log('❌ [스킵] 경로 geometry 생성 불가');
        stats.skipped += 1;
        continue;
      }

      // 거리 및 시간 산출
      let totalDistance = 0;
      if (item.stretLt) {
        const ltKm = Number.parseFloat(item.stretLt);
        if (Number.isFinite(ltKm) && ltKm > 0) totalDistance = Math.round(ltKm * 1000);
      }
      if (client && totalDistance <= 0) {
        const { rows: [calc] } = await client.query(
          `SELECT GREATEST(1, ROUND(ST_Length($1::geography))::int) AS distance`,
          [route.wkt]
        );
        totalDistance = calc?.distance || 1000;
      } else if (totalDistance <= 0) {
        totalDistance = 1000;
      }

      const estimatedDuration = parseDurationMinutes(item.reqreTime, totalDistance);
      const description = buildCourseDescription(item);
      const isCycle =
        item.beginSpotNm && item.endSpotNm && item.beginSpotNm.trim() === item.endSpotNm.trim();

      if (isDryRun) {
        const spotCount = courseWaypointsList.filter((w) => w.spotId || w.name).length;
        console.log(`✅ [드라이런 완료] 거리: ${totalDistance}m, 소요: ${estimatedDuration}분, 경유지수: ${spotCount}`);
        stats.success += 1;
        continue;
      }

      // 코스 DB 저장 (UPSERT)
      const { rows: [course] } = await client.query(
        `INSERT INTO courses (
           owner_id, name, description, category, route_geometry,
           total_distance, estimated_duration, is_cycle,
           region, sub_region, is_public, data_source, source_id, status
         )
         VALUES (
           $1, $2, $3, '관광코스', $4::geography,
           $5, $6, $7,
           $8, $9, TRUE, $10, $11, 'active'
         )
         ON CONFLICT (data_source, source_id) WHERE source_id IS NOT NULL
         DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           route_geometry = EXCLUDED.route_geometry,
           total_distance = EXCLUDED.total_distance,
           estimated_duration = EXCLUDED.estimated_duration,
           is_cycle = EXCLUDED.is_cycle,
           region = EXCLUDED.region,
           sub_region = EXCLUDED.sub_region,
           status = 'active',
           updated_at = NOW()
         RETURNING course_id`,
        [
          ownerId,
          courseName,
          description,
          route.wkt,
          totalDistance,
          estimatedDuration,
          isCycle,
          region,
          sub_region,
          DATA_SOURCE,
          sourceId,
        ]
      );

      // 경유지(Waypoints) 및 스팟 연결 저장
      await insertCourseWaypoints(client, course.course_id, courseWaypointsList);

      // 코스 태깅
      await client.query(
        `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
         VALUES ($1, $2, 'course', $3)
         ON CONFLICT DO NOTHING`,
        [tagId, course.course_id, ownerId]
      );

      const registeredSpots = courseWaypointsList.filter((w) => w.spotId).length;
      console.log(`✅ [코스 적재 완료] ID: ${course.course_id} (연결된 스팟: ${registeredSpots}개)`);
      stats.success += 1;
    }
  } catch (err) {
    console.error('\n🚨 작업 중 오류 발생:', err);
    stats.failed += 1;
  } finally {
    if (client) client.release();
    if (!isDryRun) await pool.end();
  }

  console.log('\n=============================================');
  console.log(`📊 코스 및 스팟 적재 최종 결과:`);
  console.log(`- 대상 코스 수: ${stats.total}`);
  console.log(`- 성공 코스 수: ${stats.success}`);
  console.log(`- 신규 등록 스팟: ${stats.spotsSaved}개`);
  console.log(`- TourAPI 관광정보 매칭: ${stats.tourEnriched}개`);
  console.log(`- 스킵 코스 수: ${stats.skipped}`);
  console.log(`- 실패 코스 수: ${stats.failed}`);
  console.log('=============================================\n');
}

main().catch((err) => {
  console.error('Fatal Error:', err.message);
  process.exit(1);
});
