const pool = require('../config/db');
const axios = require('axios');
const {
    SPOT_CATEGORIES,
    SPOT_CATEGORY_SEARCH_RULES,
    inferSpotCategoriesWithFallback,
    extractRegionFromAddress,
    inferRegionFromLocation,
    resolveRegion,
} = require('../constants/spotCategoryRules');
const tourApiService = require('./tourApiService');
const odiiService = require('./odiiService');
const trafficLog = require('./tourTrafficLog');

const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const TOUR_API_MATCH_RADIUS = Number(process.env.TOUR_API_MATCH_RADIUS || 300);
const TOUR_API_FALLBACK_MATCH_RADIUS = 500;

function sanitizeText(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]*>/g, '')          // HTML 태그 제거
        .replace(/&[a-zA-Z0-9#]+;/g, ' ') // &nbsp;, &amp; 등 HTML 엔티티 제거
        .replace(/[\r\t]+/g, ' ')         // 탭/개행 정규화
        .replace(/\s{2,}/g, ' ')          // 다중 공백 단일화
        .trim();
}

function getTourApiServiceKey() {
    return process.env.TOUR_API_SERVICE_KEY || process.env.TOURAPI_SERVICE_KEY;
}

function normalizeSpotCategoriesInput(categories) {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    return [...new Set(categories.map(c => String(c).trim()).filter(Boolean))];
}

function getKakaoAddress(document) {
    return document.road_address_name || document.address_name || null;
}

function getKakaoRestApiKey() {
    return process.env.KAKAO_REST_API_KEY;
}

function normalizeTourApiItems(item) {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
}

function normalizePlaceName(name = '') {
    return String(name)
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, '')
        .replace(/[·ㆍ.,'"]/g, '')
        .toLowerCase();
}

function isSameTourPlace(kakaoName, tourTitle) {
    const kakao = normalizePlaceName(kakaoName);
    const tour = normalizePlaceName(tourTitle);
    if (!kakao || !tour) return false;
    return kakao === tour || kakao.includes(tour) || tour.includes(kakao);
}

function cleanTourOverview(overview = '') {
    return String(overview)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function fetchTourLocationCandidates({ lng, lat, radius }) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey) return [];

    const api = 'KorService2';
    const pathname = 'locationBasedList2';
    const params = {
        MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
        MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
        _type: 'json',
        arrange: 'E',
        mapX: lng,
        mapY: lat,
        radius,
        numOfRows: 20,
        pageNo: 1,
    };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: { serviceKey, ...params },
        });

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;

        // 실시간 OpenAPI 트래픽 로그 기록 (공사 서버 호출 증빙)
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

        return normalizeTourApiItems(item);
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        throw err;
    }
}

async function fetchTourKeywordCandidates(keyword) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey || !keyword) return [];

    const api = 'KorService2';
    const pathname = 'searchKeyword2';
    const params = {
        MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
        MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
        _type: 'json',
        keyword: keyword.trim(),
        numOfRows: 10,
        pageNo: 1,
    };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: { serviceKey, ...params },
        });

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;

        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

        return normalizeTourApiItems(item);
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        return [];
    }
}

async function findTourApiMatchByContentId(contentId) {
    if (!contentId) return null;
    return { contentid: String(contentId), title: null, dist: null };
}

async function fetchTourOverview(contentId) {
    const serviceKey = getTourApiServiceKey();
    if (!serviceKey || !contentId) return null;

        const api = 'KorService2';
    const pathname = 'detailCommon2';
    // firstImageYN/overviewYN 을 명시해야 대표 이미지(firstimage)까지 함께 내려온다.
    const params = { _type: 'json', contentId, firstImageYN: 'Y', overviewYN: 'Y' };
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${TOUR_API_BASE_URL}/${pathname}`, {
            params: {
                serviceKey,
                MobileOS: process.env.TOUR_API_MOBILE_OS || 'ETC',
                MobileApp: process.env.TOUR_API_MOBILE_APP || 'WalkBuddy',
                                _type: 'json',
                contentId,
                firstImageYN: 'Y',
                overviewYN: 'Y',
            },
        });

        const header = response.data?.response?.header;
        const item = response.data?.response?.body?.items?.item;
        const detail = normalizeTourApiItems(item)[0];

        // 실시간 OpenAPI 트래픽 로그 기록 (공사 서버 호출 증빙)
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'ok',
            httpStatus: response.status,
            resultCode: header?.resultCode || '0000',
            durationMs: Date.now() - startedAt,
            startedAt,
        });

        // overview(개요) + firstImage(대표 이미지 URL) 를 함께 반환한다.
        return {
            overview: cleanTourOverview(detail?.overview || ''),
            firstImage: detail?.firstimage || detail?.firstimage2 || null,
        };
    } catch (err) {
        trafficLog.record({
            api,
            pathname,
            params,
            status: 'error',
            httpStatus: err.response?.status ?? null,
            message: err.message,
            durationMs: Date.now() - startedAt,
            startedAt,
        });
        throw err;
    }
}

// 관광공사 응답에서 세부 태그 자동 도출
function extractTourTags({ overview, barrierFreeInfo, petTourInfo, odiiGuide }) {
    const tags = new Set();

    // 1. Odii 오디오 가이드 음원/스크립트 연동 시에만 Odii음성해설 태그 부착
    if (odiiGuide?.audio_url || odiiGuide?.script) {
        tags.add('Odii음성해설');
    }

    // 2. 무장애 편의시설 (KorWithService2) 세부 태그
    if (barrierFreeInfo?.has_barrier_free_info && barrierFreeInfo.details) {
        tags.add('열린관광');
        const d = barrierFreeInfo.details;
        if (d.physical?.wheelchair) {
            const wcStr = String(d.physical.wheelchair);
            if (/대여|렌탈/.test(wcStr)) {
                tags.add('휠체어대여');
            } else {
                tags.add('휠체어접근');
            }
        }
        if (d.physical?.route && !/(불가|어려움|없음)/.test(d.physical.route)) tags.add('무단차통로');
        if (d.physical?.restroom && !/(없음|미설치)/.test(d.physical.restroom)) tags.add('장애인화장실');
        if (d.physical?.parking && !/(없음|불가)/.test(d.physical.parking)) tags.add('장애인주차');
        if (d.physical?.elevator) tags.add('엘리베이터');
        if (d.infant?.stroller && !/(불가|없음)/.test(d.infant.stroller)) tags.add('유모차대여');
        if (d.infant?.lactation_room && !/(없음|미설치)/.test(d.infant.lactation_room)) tags.add('수유실');
        if (d.visual?.braile_block || d.visual?.braile_promotion) tags.add('점자안내');
        if (d.visual?.help_dog && !/(불가|금지)/.test(d.visual.help_dog)) tags.add('안내견동반');
        if (d.visual?.audio_guide && !/(없음|미설치)/.test(d.visual.audio_guide)) tags.add('시각장애인음성안내');
        if (d.hearing?.sign_language || d.hearing?.video_guide) tags.add('수어안내');
    }

    // 3. 반려동물 동반 (KorPetTourService2) 세부 태그
    if (petTourInfo?.has_pet_info) {
        tags.add('반려견동반');
        const petDetails = petTourInfo.details || {};
        const sizeStr = `${petDetails.allowed_pet_size || ''} ${petDetails.etc_info || ''} ${petDetails.pet_tour_info || ''}`;
        if (!/(출입\s*불가|입장\s*금지)/.test(sizeStr)) {
            if (/대형견|전\s*견종|전견종|모든\s*견종|제한\s*없음|제한없음/i.test(sizeStr)) {
                tags.add('대형견가능');
            }
            if (/소형견|중[,\s·]*소형견|중형견|10kg|15kg|전\s*견종|전견종|모든\s*견종/i.test(sizeStr)) {
                tags.add('소형견동반');
            }
        }

        const facilityStr = `${petDetails.facilities || ''} ${petDetails.etc_info || ''}`;
        if (/배변|배변봉투|배변시설|수거함/i.test(facilityStr) && !/(없음|미설치)/.test(facilityStr)) {
            tags.add('반려견배변시설');
        }
        if (/놀이터|운동장|안전문|펜스/i.test(facilityStr) && !/(없음|미설치)/.test(facilityStr)) {
            tags.add('반려견놀이터');
        }
        if ((facilityStr.includes('주차') || facilityStr.includes('주차장')) && !/(주차\s*불가|주차장\s*없음)/.test(facilityStr)) tags.add('주차가능');
        if (facilityStr.includes('화장실') && !/(화장실\s*없음)/.test(facilityStr)) tags.add('화장실');
        if ((facilityStr.includes('쉼터') || facilityStr.includes('벤치')) && !/(쉼터\s*없음)/.test(facilityStr)) tags.add('벤치·쉼터');
    }

    return Array.from(tags);
}

// ──────────────────────────────────────────────────────────
// 자동 태깅용 "시스템 태깅 계정" 보장
//   taggings.user_id 는 NOT NULL + FK(users) 이므로 자동 태깅은 반드시
//   실제 user_id 가 필요하다. 관리자 계정이 있으면 그 계정을, 없으면
//   'system-tagger' 시드 계정을 1회 생성·재사용한다.
// ──────────────────────────────────────────────────────────
let cachedSystemTaggerId = null;

async function ensureSystemTaggerId() {
    if (cachedSystemTaggerId) return cachedSystemTaggerId;

    // 1. 활성 관리자 우선
    const { rows: admins } = await pool.query(
        `SELECT user_id FROM users
         WHERE role = 'admin' AND status = 'active'
         ORDER BY created_at LIMIT 1`
    );
    if (admins.length) {
        cachedSystemTaggerId = admins[0].user_id;
        return cachedSystemTaggerId;
    }

    // 2. 기존 시스템 태거 계정 재사용
    const { rows: seedUsers } = await pool.query(
        `SELECT user_id FROM users
         WHERE social_provider = 'seed' AND social_id = 'system-tagger'
         LIMIT 1`
    );
    if (seedUsers.length) {
        cachedSystemTaggerId = seedUsers[0].user_id;
        return cachedSystemTaggerId;
    }

        // 3. 없으면 생성 (nickname UNIQUE 충돌 방지를 위해 ON CONFLICT 후 재조회 폴백)
    try {
        const { rows: created } = await pool.query(
            `INSERT INTO users (nickname, social_provider, social_id, role, status)
             VALUES ('자동태깅', 'seed', 'system-tagger', 'admin', 'active')
             ON CONFLICT (nickname) DO NOTHING
             RETURNING user_id`
        );
        if (created.length) {
            cachedSystemTaggerId = created[0].user_id;
            return cachedSystemTaggerId;
        }
    } catch (err) {
        console.warn('[ensureSystemTaggerId] 시스템 태거 생성 실패, 재조회:', err.message);
    }

    // 3-b. nickname 충돌 등으로 생성이 안 됐다면 social 기준으로 재조회
    const { rows: retry } = await pool.query(
        `SELECT user_id FROM users
         WHERE social_provider = 'seed' AND social_id = 'system-tagger' LIMIT 1`
    );
    if (retry.length) {
        cachedSystemTaggerId = retry[0].user_id;
        return cachedSystemTaggerId;
    }

    return null;
}

// 스팟에 세부 태그 일괄 자동 부착
async function attachTagsToSpot(spotId, tagNames, userId) {
    if (!spotId || !Array.isArray(tagNames) || tagNames.length === 0) return;
    const cleanNames = tagNames.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
    if (cleanNames.length === 0) return;

        try {
        // 0. 실제 taggings.user_id 확보 (자동 태깅은 시스템 계정으로 귀속)
        //    → 기존 userId || null 은 NOT NULL/FK 위반으로 조용히 실패하던 버그
        const taggerId = userId || await ensureSystemTaggerId();
        if (!taggerId) {
            console.error('attachTagsToSpot skipped: no valid user_id for tagging');
            return;
        }

        // 1. 기존 태그 확인
        const { rows: existingTags } = await pool.query(
            `SELECT tag_id, name FROM tags WHERE name = ANY($1::TEXT[]) AND type = 'spot'`,
            [cleanNames]
        );

        const existingNames = new Set(existingTags.map(r => r.name));
        const tagsToAttach = [...existingTags];

        // 2. 누락된 태그는 tags 테이블에 안전하게 자동 등록
        const missingNames = cleanNames.filter(n => !existingNames.has(n));
        for (const name of missingNames) {
            const { rows } = await pool.query(
                `INSERT INTO tags (name, type, group_name, is_active)
                 VALUES ($1, 'spot', '기타', TRUE)
                 ON CONFLICT (name, type) DO UPDATE SET is_active = TRUE
                 RETURNING tag_id, name`,
                [name]
            );
            if (rows[0]) tagsToAttach.push(rows[0]);
        }

        // 3. taggings 테이블에 일괄 등록
        for (const tag of tagsToAttach) {
            await pool.query(
                `INSERT INTO taggings (tag_id, target_id, target_type, user_id)
                 VALUES ($1, $2, 'spot', $3)
                 ON CONFLICT DO NOTHING`,
                [tag.tag_id, spotId, taggerId]
            );
        }
    } catch (err) {
        console.error('attachTagsToSpot error:', err.message);
    }
}

async function searchKakaoSpotCandidates({ keyword, category, size = 15 }) {
    const kakaoRestApiKey = getKakaoRestApiKey();
    if (!kakaoRestApiKey) {
        const err = new Error('Kakao REST API key is not configured');
        err.status = 500;
        throw err;
    }

    if (!keyword && !category) {
        const err = new Error('keyword or category is required');
        err.status = 400;
        throw err;
    }

    if (category && !SPOT_CATEGORIES.includes(category)) {
        const err = new Error('unsupported spot category');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    const rules = keyword ? [{ query: keyword }] : SPOT_CATEGORY_SEARCH_RULES[category];
    const allDocuments = [];

    for (const rule of rules) {
        const params = { query: rule.query, size, page: 1 };
        if (rule.category_group_code) params.category_group_code = rule.category_group_code;

        const kakaoResponse = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
            params,
            headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
        });
        allDocuments.push(...(kakaoResponse.data.documents || []));
    }

    const uniqueKakaoSpotMap = new Map();
    for (const document of allDocuments) {
        const categories = inferSpotCategoriesWithFallback(document);
        if (categories.length === 0) continue;
        if (category && !categories.includes(category)) continue;
        uniqueKakaoSpotMap.set(document.id, {
            kakao_place_id: document.id,
            name: document.place_name,
            kakao_category_name: document.category_name,
            categories,
            address: getKakaoAddress(document),
            x: document.x,
            y: document.y,
            distance: document.distance ? Number(document.distance) : null,
        });
    }

    return Array.from(uniqueKakaoSpotMap.values());
}

async function enrichKakaoSpotTourContent(spot, userId) {
    const result = {
        tour_content_enriched: false,
        tour_content_status: 'skipped',
        tour_content_match: null,
        barrier_free_enriched: false,
        pet_tour_enriched: false,
        attached_tags: [],
    };

    if (!getTourApiServiceKey()) {
        result.tour_content_status = 'skipped_missing_tour_api_key';
        return { spot, ...result };
    }

    const lng = Number(spot.x);
    const lat = Number(spot.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        result.tour_content_status = 'skipped_invalid_location';
        return { spot, ...result };
    }

    try {
        // Odii 오디오 가이드 검색을 병렬로 함께 시작
        const odiiPromise = odiiService.findBestOdiiGuide({
            name: spot.name,
            x: lng,
            y: lat,
        }).catch(() => null);

        let matched = await findTourApiMatchByContentId(spot.tour_api_content_id);
        let candidates = [];

        if (!matched) {
            candidates = await fetchTourLocationCandidates({
                lng,
                lat,
                radius: TOUR_API_MATCH_RADIUS,
            });

            matched = candidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0))[0];
        }

        if (!matched && TOUR_API_MATCH_RADIUS < TOUR_API_FALLBACK_MATCH_RADIUS) {
            candidates = await fetchTourLocationCandidates({
                lng,
                lat,
                radius: TOUR_API_FALLBACK_MATCH_RADIUS,
            });
            matched = candidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0))[0];
        }

        // 3차 폴백: 키워드 검색 기반 매칭 (관광지 위치가 카카오 좌표와 조금 다르거나 반경 밖인 경우)
        if (!matched) {
            const kwCandidates = await fetchTourKeywordCandidates(spot.name);
            matched = kwCandidates
                .filter(candidate => isSameTourPlace(spot.name, candidate.title))
                .sort((a, b) => {
                    const distA = Math.hypot(Number(a.mapx || 0) - lng, Number(a.mapy || 0) - lat);
                    const distB = Math.hypot(Number(b.mapx || 0) - lng, Number(b.mapy || 0) - lat);
                    return distA - distB;
                })[0];
        }

        const updateClauses = [];
        const updateParams = [spot.spot_id];

        let overview = null;
        let tourFirstImage = null;

        if (matched?.contentid) {
            const contentId = String(matched.contentid);
            result.tour_content_match = {
                content_id: contentId,
                title: matched.title,
                distance: matched.dist == null ? null : Number(matched.dist),
            };

            // 1. 한국관광공사 전방위 API(개요, 무장애, 반려동물) 병렬 조회
            const [overviewResult, barrierFreeResult, petTourResult] = await Promise.allSettled([
                fetchTourOverview(contentId),
                tourApiService.getBarrierFreeInfo(contentId),
                tourApiService.getPetTourDetail(contentId),
            ]);

            const tourDetail = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
            overview = tourDetail?.overview || null;
            const barrierFreeInfo = barrierFreeResult.status === 'fulfilled' ? barrierFreeResult.value : null;
            const petTourInfo = petTourResult.status === 'fulfilled' ? petTourResult.value : null;

            tourFirstImage = matched.firstimage || matched.firstimage2 || tourDetail?.firstImage || null;

            if (barrierFreeInfo?.has_barrier_free_info) {
                updateParams.push(JSON.stringify(barrierFreeInfo.details));
                updateClauses.push(`barrier_free_info = $${updateParams.length}`);
                result.barrier_free_enriched = true;
            }

            if (petTourInfo?.has_pet_info && petTourInfo.details) {
                updateParams.push(JSON.stringify(petTourInfo.details));
                updateClauses.push(`pet_tour_info = $${updateParams.length}`);
                result.pet_tour_enriched = true;
            } else if (petTourInfo?.has_pet_info) {
                result.pet_tour_enriched = true;
            }

            if (tourFirstImage && !spot.first_image) {
                updateParams.push(tourFirstImage);
                updateClauses.push(`first_image = $${updateParams.length}`);
            }
        } else {
            result.tour_content_status = 'no_matching_tour_place';
        }

        // Odii 오디오 가이드 결과 수신
        const odiiGuide = await odiiPromise;
        const sanitizedOdii = sanitizeText(odiiGuide?.script);
        const sanitizedOverview = sanitizeText(overview);

        // 둘 다 있으면 병합, 둘 중 하나만 있어도 적재
        let combinedTourContent = null;
        if (sanitizedOdii && sanitizedOverview) {
            combinedTourContent = `[스토리 해설]\n${sanitizedOdii}\n\n[관광 정보 개요]\n${sanitizedOverview}`;
        } else if (sanitizedOdii) {
            combinedTourContent = sanitizedOdii;
        } else if (sanitizedOverview) {
            combinedTourContent = sanitizedOverview;
        }

        if (combinedTourContent && !spot.content_tour) {
            updateParams.push(combinedTourContent);
            updateClauses.push(`content_tour = $${updateParams.length}`);
            result.tour_content_enriched = true;
        }

        let updatedSpot = spot;
        if (updateClauses.length > 0) {
            const updatedResult = await pool.query(
                `UPDATE spots
                 SET ${updateClauses.join(', ')}
                 WHERE spot_id = $1
                 RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                           recommend_pct, content_tour, barrier_free_info, pet_tour_info, first_image,
                           ST_X(location::GEOMETRY) AS x,
                           ST_Y(location::GEOMETRY) AS y`,
                updateParams
            );
            if (updatedResult.rows[0]) {
                updatedSpot = updatedResult.rows[0];
            }
        }

        // 3. 세부 기능별 태그 자동 도출 및 일괄 부착
        const autoTags = extractTourTags({ overview, barrierFreeInfo, petTourInfo, odiiGuide });
        if (autoTags.length > 0) {
            await attachTagsToSpot(updatedSpot.spot_id, autoTags, userId);
            result.attached_tags = autoTags;
        }

        result.tour_content_status = (result.tour_content_enriched || result.barrier_free_enriched || result.pet_tour_enriched)
            ? 'enriched'
            : 'matched_without_new_content';

        return {
            spot: {
                ...updatedSpot,
                x: Number(updatedSpot.x),
                y: Number(updatedSpot.y),
                recommend_pct: updatedSpot.recommend_pct == null ? null : Number(updatedSpot.recommend_pct),
            },
            ...result,
        };
    } catch (err) {
        console.error('[TourAPI multi-enrich failed]', err.message);
        result.tour_content_status = 'tour_api_error';
        return { spot, ...result };
    }
}

// ──────────────────────────────────────────────────────────────────────
// 스팟 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpots = async (query) => {
    const {
        category,
        tag_ids,
        tag_name,
        tag_names,
        min_recommend_pct,
        region,
        sub_region,
        sort = 'latest',
        page = 1,
        limit = 20,
    } = query;

    const rawKeyword = Array.isArray(query.keyword ?? query.q) ? (query.keyword ?? query.q)[0] : (query.keyword ?? query.q);
    const keyword = rawKeyword === undefined || rawKeyword === null ? null : String(rawKeyword).trim();

        const offset = (Number(page) - 1) * Number(limit);
    // 탐색 기본 목록에서는 사용자가 담은 카카오 장소(source='kakao')를 노출하지 않는다.
    //   → 카카오 실시간 후보는 '산책로 만들기(장소 추가)' 진입점에서만 사용하고,
    //     기본 목록은 자체 DB에 저장된 장소(admin 소스)만 노출한다.
    const whereConditions = ["s.status = 'active'", "s.source <> 'kakao'"];
    const queryValues = [];

    // 정렬 매핑
    const orderMap = {
        recommend: 's.recommend_pct DESC NULLS LAST, s.created_at DESC',
        recommend_pct: 's.recommend_pct DESC NULLS LAST, s.created_at DESC',
        name: 's.name ASC, s.created_at DESC',
        latest: 's.created_at DESC',
    };
    const orderBySql = orderMap[sort] || 's.created_at DESC';

    // 지역 필터
    if (region && String(region).trim()) {
        const reg = String(region).trim();
        const normalizedReg = reg.toLowerCase();
        if (!['전국', '전체', 'all'].includes(normalizedReg)) {
            if (['seoul', '서울', '서울특별시'].includes(normalizedReg) || reg === '서울' || reg === '서울특별시') {
                queryValues.push('서울');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else if (
                ['chuncheon', '춘천', '춘천시', '강원', '강원도', '강원특별자치도', 'gangwon'].includes(normalizedReg) ||
                ['춘천', '춘천시', '강원', '강원도', '강원특별자치도'].includes(reg)
            ) {
                queryValues.push('춘천');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else {
                queryValues.push(`%${reg}%`);
                whereConditions.push(`(s.sub_region ILIKE $${queryValues.length} OR s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length})`);
            }
        }
    }

    // 세부 권역 필터
    if (sub_region && String(sub_region).trim()) {
        const sub = String(sub_region).trim();
        if (!['전체', 'all'].includes(sub.toLowerCase()) && sub !== '전체') {
            queryValues.push(`%${sub}%`);
            whereConditions.push(`(s.sub_region ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length})`);
        }
    }

    // 카테고리 필터
    if (category) {
        if (!SPOT_CATEGORIES.includes(category)) {
            const err = new Error('unsupported spot category');
            err.status = 400;
            err.supported_categories = SPOT_CATEGORIES;
            throw err;
        }
        queryValues.push(category);
        whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
    }

    // 키워드 검색 (스팟명, 주소, 세부권역)
    if (keyword) {
        queryValues.push(`%${keyword}%`);
        whereConditions.push(`(s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length} OR s.sub_region ILIKE $${queryValues.length})`);
    }

    // 태그 ID 목록 검색 (UUID) — 열린관광 및 반려견동반 선택 시 하위 태그 자동 포함(Group Expansion)
    if (tag_ids) {
        const tagIdList = (Array.isArray(tag_ids) ? tag_ids.join(',') : tag_ids)
            .split(',').map(t => t.trim()).filter(Boolean);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (tagIdList.some(t => !uuidPattern.test(t))) {
            const err = new Error('tag_ids must be comma-separated UUID values');
            err.status = 400; throw err;
        }
        if (tagIdList.length > 0) {
            queryValues.push(tagIdList); const tagIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND (
                        tg.tag_id = ANY($${tagIdx}::UUID[])
                        OR (
                            t.group_name = '열린관광' AND EXISTS (
                                SELECT 1 FROM tags t_p WHERE t_p.name = '열린관광' AND t_p.type = 'spot' AND t_p.tag_id = ANY($${tagIdx}::UUID[])
                            )
                        )
                        OR (
                            t.group_name = '반려동물' AND EXISTS (
                                SELECT 1 FROM tags t_p WHERE t_p.name = '반려견동반' AND t_p.type = 'spot' AND t_p.tag_id = ANY($${tagIdx}::UUID[])
                            )
                        )
                    )
                    GROUP BY tg.target_id
                )
            `);
        }
    }

    // 태그 이름(tag_name / tag_names) 검색 지원 — 열린관광 및 반려견동반 선택 시 하위 태그 자동 포함
    const targetTagNames = tag_name || tag_names;
    if (targetTagNames) {
        const tagNameList = (Array.isArray(targetTagNames) ? targetTagNames.join(',') : targetTagNames)
            .split(',')
            .map(t => t.trim().replace(/^#/, ''))
            .filter(Boolean);

        if (tagNameList.length > 0) {
            queryValues.push(tagNameList);
            const tagIdx = queryValues.length;
            whereConditions.push(`
                s.spot_id IN (
                    SELECT tg.target_id
                    FROM taggings tg
                    JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
                    WHERE tg.target_type = 'spot' AND (
                        t.name = ANY($${tagIdx}::TEXT[])
                        OR ('열린관광' = ANY($${tagIdx}::TEXT[]) AND t.group_name = '열린관광')
                        OR ('반려견동반' = ANY($${tagIdx}::TEXT[]) AND t.group_name = '반려동물')
                    )
                    GROUP BY tg.target_id
                )
            `);
        }
    }

    if (min_recommend_pct) {
        const pct = Number(min_recommend_pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            const err = new Error('min_recommend_pct must be a number between 0 and 100');
            err.status = 400; throw err;
        }
        queryValues.push(pct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

    const countResult = await pool.query(
        `SELECT COUNT(DISTINCT s.spot_id) AS total FROM spots s WHERE ${whereConditions.join(' AND ')}`,
        queryValues
    );

    queryValues.push(Number(limit)); const limitIdx = queryValues.length;
    queryValues.push(offset);        const offsetIdx = queryValues.length;

        const spotsResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.region, s.sub_region, s.recommend_pct,
            s.barrier_free_info, s.is_night_tour,
            s.first_image,
            -- 후기 사진 폴백: 이 장소의 후기 중 사진이 있는 가장 최근 후기의 첫 사진 key
            (
                SELECT sr.photos[1]
                FROM spot_reviews sr
                WHERE sr.spot_id = s.spot_id
                  AND sr.status = 'active'
                  AND sr.photos IS NOT NULL
                  AND array_length(sr.photos, 1) > 0
                ORDER BY sr.created_at DESC
                LIMIT 1
            ) AS review_photo_url,
            ST_X(s.location::GEOMETRY) AS x,
            ST_Y(s.location::GEOMETRY) AS y,
            s.content_place IS NOT NULL AS has_content_place,
            s.content_history IS NOT NULL AS has_content_history,
            s.content_tour IS NOT NULL AS has_content_tour,
            s.created_at,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
            ) AS tags
        FROM spots s
        LEFT JOIN taggings tg ON tg.target_id = s.spot_id AND tg.target_type = 'spot'
        LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY s.spot_id
        ORDER BY ${orderBySql}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryValues
    );

    const spots = spotsResult.rows.map(s => ({
        ...s,
        x: Number(s.x),
        y: Number(s.y),
        recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        tags: s.tags || [],
        top_tags: s.tags || [],
    }));

    const total = Number(countResult.rows[0]?.total || 0);

    return {
        total,
        total_count: total,
        page: Number(page),
        limit: Number(limit),
        spots,
    };
};



// ──────────────────────────────────────────────────────────────────────
// 스팟 상세 조회
// ──────────────────────────────────────────────────────────────────────
exports.getSpotById = async (spotId) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(spotId).trim());
    if (!isUuid) {
        if (/^\d+$/.test(String(spotId).trim())) {
            const tourDetail = await tourApiService.getSpotDetail(spotId);
            return {
                spot_id: String(spotId),
                content_id: String(spotId),
                name: tourDetail.title,
                address: tourDetail.address,
                x: tourDetail.x,
                y: tourDetail.y,
                source: 'tour',
                overview: tourDetail.overview,
                tel: tourDetail.tel,
                homepage: tourDetail.homepage,
                first_image: tourDetail.images?.[0]?.image_url || null,
                images: tourDetail.images?.map(i => i.image_url) || [],
                top_tags: [],
                courses: [],
            };
        }
        const err = new Error('스팟을 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    const spotResult = await pool.query(
        `SELECT
            s.spot_id, s.name, s.address, s.categories, s.kakao_category_name,
            s.region, s.sub_region,
                        s.recommend_pct, s.source, s.content_place, s.content_history, s.content_tour,
            s.barrier_free_info, s.is_night_tour,
            s.first_image,
            ST_X(s.location::GEOMETRY) AS x,
            ST_Y(s.location::GEOMETRY) AS y,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]'
            ) AS top_tags
         FROM spots s
         LEFT JOIN taggings tg ON tg.target_type = 'spot' AND tg.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.type = 'spot' AND t.is_active = TRUE
         WHERE s.spot_id = $1 AND s.status = 'active'
         GROUP BY s.spot_id`,
        [spotId]
    );

    if (!spotResult.rows.length) {
        const err = new Error('스팟을 찾을 수 없습니다.');
        err.status = 404; throw err;
    }

    const coursesResult = await pool.query(
        `SELECT DISTINCT c.course_id, c.name, c.total_distance, c.estimated_duration, c.is_public
         FROM courses c
         JOIN course_waypoints cw ON cw.course_id = c.course_id
         WHERE cw.spot_id = $1 AND c.status = 'active' AND c.is_public = TRUE
         LIMIT 10`,
        [spotId]
    );

    const spot = spotResult.rows[0];
    return {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        courses: coursesResult.rows,
    };
};

// ──────────────────────────────────────────────────────────────────────
// 스팟 직접 등록
// ──────────────────────────────────────────────────────────────────────
exports.createSpot = async (body) => {
    const { name, x, y, address, categories, kakao_category_name, content_place, content_history, content_tour, region, sub_region } = body;
    const normalizedCategories = normalizeSpotCategoriesInput(categories);

    if (normalizedCategories.length === 0) {
        const err = new Error('categories는 비어있지 않은 문자열 배열이어야 합니다.');
        err.status = 400; throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x, y는 유효한 숫자여야 합니다.');
        err.status = 400; throw err;
    }

                    // 좌표(스팟 자체 위치) 기반 권역 추론 → 춘천이면 근처 권역, 아니면 주소 키워드 폴백
    // (이용자 실시간 GPS 아님 → LBS 사업자 미신고 요건 유지)
    const regionInfo = inferRegionFromLocation({
        lat,
        lng,
        address: `${address || ''} ${name || ''}`,
    });
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

    const result = await pool.query(
        `INSERT INTO spots (
            name, location, address, categories,
            kakao_category_name, source,
            content_place, content_history, content_tour,
            region, sub_region
        ) VALUES (
            $1, ST_Point($2, $3)::GEOGRAPHY, $4, $5::TEXT[], $6, 'admin', $7, $8, $9, $10, $11
        )
        RETURNING
            spot_id, name, address, categories, kakao_category_name, source,
            region, sub_region,
            content_place, content_history, content_tour,
            recommend_pct, status, created_at,
            ST_X(location::GEOMETRY) AS x,
            ST_Y(location::GEOMETRY) AS y`,
        [name, lng, lat, address || null, normalizedCategories, kakao_category_name || null,
         content_place || null, content_history || null, content_tour || null,
         determinedRegion, determinedSubRegion]
    );

    const spot = result.rows[0];
    return { ...spot, x: Number(spot.x), y: Number(spot.y) };
};

// ──────────────────────────────────────────────────────────────────────
// 카카오 스팟 저장
// ──────────────────────────────────────────────────────────────────────
exports.saveKakaoSpot = async (body, userId) => {
    const {
        kakao_place_id,
        name,
        kakao_category_name,
        categories,
        address,
        road_address_name,
        address_name,
        x,
        y,
        region,
        sub_region,
        tour_api_content_id,
    } = body;
    const normalizedCategories = normalizeSpotCategoriesInput(categories);

    if (normalizedCategories.length === 0) {
        const err = new Error('categories must be a non-empty string array');
        err.status = 400; throw err;
    }

    const lng = Number(x);
    const lat = Number(y);
    const selectedAddress = road_address_name || address || address_name || null;

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        const err = new Error('x and y must be valid numbers');
        err.status = 400; throw err;
    }

                    // 좌표(스팟 자체 위치) 기반 권역 추론 → 춘천이면 근처 권역, 아니면 주소 키워드 폴백
    // (이용자 실시간 GPS 아님 → LBS 사업자 미신고 요건 유지)
    const regionInfo = inferRegionFromLocation({
        lat,
        lng,
        address: `${selectedAddress || ''} ${name || ''}`,
    });
    const determinedRegion = region || regionInfo.region || '서울';
    const determinedSubRegion = sub_region || regionInfo.sub_region || null;

    const createdResult = await pool.query(
        `INSERT INTO spots (kakao_place_id, name, location, address, categories, kakao_category_name, source, region, sub_region, last_synced_at)
         VALUES ($1, $2, ST_Point($3, $4)::GEOGRAPHY, $5, $6::TEXT[], $7, 'kakao', $8, $9, NOW())
         ON CONFLICT (kakao_place_id) DO NOTHING
         RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                   region, sub_region,
                   recommend_pct, content_tour,
                   ST_X(location::GEOMETRY) AS x,
                   ST_Y(location::GEOMETRY) AS y`,
        [kakao_place_id, name, lng, lat, selectedAddress, normalizedCategories, kakao_category_name || null, determinedRegion, determinedSubRegion]
    );

    if (createdResult.rows.length > 0) {
        const spot = createdResult.rows[0];
        const normalizedSpot = {
            ...spot,
            x: Number(spot.x),
            y: Number(spot.y),
            recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
            tour_api_content_id,
        };
        const enriched = await enrichKakaoSpotTourContent(normalizedSpot, userId);
        return { is_created: true, ...enriched };
    }

    const existingResult = await pool.query(
        `SELECT spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                region, sub_region,
                recommend_pct, content_tour, status,
                ST_X(location::GEOMETRY) AS x,
                ST_Y(location::GEOMETRY) AS y
         FROM spots WHERE kakao_place_id = $1`,
        [kakao_place_id]
    );

    const existingSpot = existingResult.rows[0];
    if (!existingSpot || existingSpot.status !== 'active') {
        const err = new Error('This spot is not available');
        err.status = 409; throw err;
    }

    let currentSpot = existingSpot;
    if (selectedAddress && existingSpot.address !== selectedAddress) {
        const updatedResult = await pool.query(
            `UPDATE spots SET address = $2, region = $3, sub_region = $4, last_synced_at = NOW() WHERE spot_id = $1
             RETURNING spot_id, kakao_place_id, name, address, categories, kakao_category_name,
                       region, sub_region,
                       recommend_pct, content_tour,
                       ST_X(location::GEOMETRY) AS x,
                       ST_Y(location::GEOMETRY) AS y`,
            [existingSpot.spot_id, selectedAddress, determinedRegion, determinedSubRegion]
        );
        currentSpot = updatedResult.rows[0];
    }

    const { status, ...spot } = currentSpot;
    const normalizedSpot = {
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
        recommend_pct: spot.recommend_pct == null ? null : Number(spot.recommend_pct),
        tour_api_content_id,
    };
    const enriched = await enrichKakaoSpotTourContent(normalizedSpot, userId);
    return { is_created: false, ...enriched };
};

exports.searchKakaoSpotCandidates = searchKakaoSpotCandidates;

// ──────────────────────────────────────────────────────────────────────
// 스팟 검색 (카카오 + DB 통합)
// ──────────────────────────────────────────────────────────────────────
exports.searchSpots = async (query) => {
    const { category, tag_ids, min_recommend_pct, region } = query;
    const rawKeyword = Array.isArray(query.keyword ?? query.q) ? (query.keyword ?? query.q)[0] : (query.keyword ?? query.q);
    const keyword = rawKeyword === undefined || rawKeyword === null ? null : String(rawKeyword).trim();

    if (!category && !keyword) {
        const err = new Error('category or keyword query parameter is required');
        err.status = 400;
        throw err;
    }

    if (category && !SPOT_CATEGORIES.includes(category)) {
        const err = new Error('unsupported spot category');
        err.status = 400;
        err.supported_categories = SPOT_CATEGORIES;
        throw err;
    }

    let tagIdList = [];
    if (tag_ids !== undefined && tag_ids !== null && tag_ids !== '') {
        const rawTagIds = Array.isArray(tag_ids) ? tag_ids.join(',') : tag_ids;
        tagIdList = rawTagIds.split(',').map(t => t.trim()).filter(Boolean);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (tagIdList.some(t => !uuidPattern.test(t))) {
            const err = new Error('tag_ids must be comma-separated UUID values');
            err.status = 400; throw err;
        }
    }

    let minRecommendPct = null;
    if (min_recommend_pct !== undefined && min_recommend_pct !== null && min_recommend_pct !== '') {
        minRecommendPct = Number(min_recommend_pct);
        if (!Number.isFinite(minRecommendPct) || minRecommendPct < 0 || minRecommendPct > 100) {
            const err = new Error('min_recommend_pct must be a number between 0 and 100');
            err.status = 400; throw err;
        }
    }

    const kakaoSpots = await searchKakaoSpotCandidates({
        keyword,
        category,
    });
    const kakaoPlaceIds = kakaoSpots.map(s => s.kakao_place_id);

    let savedKakaoPlaceIdSet = new Set();
    if (kakaoPlaceIds.length > 0) {
        const saved = await pool.query(
            `SELECT kakao_place_id FROM spots WHERE kakao_place_id = ANY($1::TEXT[])`,
            [kakaoPlaceIds]
        );
        savedKakaoPlaceIdSet = new Set(saved.rows.map(r => r.kakao_place_id));
    }

    // 저장 장소(saved_spots) 중 source='kakao' 는 목록에서 제외한다.
    //   → 키워드/필터 탐색 결과에도 카카오 실시간 후보는 kakao_candidates 로만 내려보낸다.
    const whereConditions = ["s.status = 'active'", "s.source <> 'kakao'"];
    const queryValues = [];
    let orderBySql = 's.created_at DESC';

    if (region && String(region).trim()) {
        const reg = String(region).trim();
        const normalizedReg = reg.toLowerCase();
        if (!['전국', '전체', 'all'].includes(normalizedReg)) {
            if (['seoul', '서울', '서울특별시'].includes(normalizedReg) || reg === '서울' || reg === '서울특별시') {
                queryValues.push('서울');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else if (
                ['chuncheon', '춘천', '춘천시', '강원', '강원도', '강원특별자치도', 'gangwon'].includes(normalizedReg) ||
                ['춘천', '춘천시', '강원', '강원도', '강원특별자치도'].includes(reg)
            ) {
                queryValues.push('춘천');
                whereConditions.push(`s.region = $${queryValues.length}`);
            } else {
                queryValues.push(`%${reg}%`);
                whereConditions.push(`(s.name ILIKE $${queryValues.length} OR s.address ILIKE $${queryValues.length} OR s.sub_region ILIKE $${queryValues.length})`);
            }
        }
    }

    if (category) {
        queryValues.push(category);
        whereConditions.push(`s.categories @> ARRAY[$${queryValues.length}]::TEXT[]`);
    }

    if (keyword) {
        queryValues.push(`%${keyword}%`);
        whereConditions.push(`(
            s.name ILIKE $${queryValues.length}
            OR COALESCE(s.address, '') ILIKE $${queryValues.length}
            OR COALESCE(s.kakao_category_name, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_place, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_history, '') ILIKE $${queryValues.length}
            OR COALESCE(s.content_tour, '') ILIKE $${queryValues.length}
        )`);
    }

    if (tagIdList.length > 0) {
        queryValues.push(tagIdList); const tagIdx = queryValues.length;
        queryValues.push(tagIdList.length); const cntIdx = queryValues.length;
        whereConditions.push(`
            s.spot_id IN (
                SELECT tg.target_id FROM taggings tg
                WHERE tg.target_type = 'spot' AND tg.tag_id = ANY($${tagIdx}::UUID[])
                GROUP BY tg.target_id HAVING COUNT(DISTINCT tg.tag_id) = $${cntIdx}
            )
        `);
    }

    if (minRecommendPct !== null) {
        queryValues.push(minRecommendPct);
        whereConditions.push(`s.recommend_pct >= $${queryValues.length}`);
    }

        const savedSpotsResult = await pool.query(
        `SELECT s.spot_id, s.kakao_place_id, s.name, s.address, s.categories, s.kakao_category_name,
                s.region, s.sub_region,
                s.recommend_pct,
                s.first_image,
                -- 후기 사진 폴백: 사진이 있는 가장 최근 후기의 첫 사진 key
                (
                    SELECT sr.photos[1]
                    FROM spot_reviews sr
                    WHERE sr.spot_id = s.spot_id
                      AND sr.status = 'active'
                      AND sr.photos IS NOT NULL
                      AND array_length(sr.photos, 1) > 0
                    ORDER BY sr.created_at DESC
                    LIMIT 1
                ) AS review_photo_url,
                ST_X(s.location::GEOMETRY) AS x, ST_Y(s.location::GEOMETRY) AS y,
                COALESCE(json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]') AS tags
         FROM spots s
         LEFT JOIN taggings tg_all ON tg_all.target_type = 'spot' AND tg_all.target_id = s.spot_id
         LEFT JOIN tags t ON t.tag_id = tg_all.tag_id AND t.type = 'spot' AND t.is_active = true
         WHERE ${whereConditions.join(' AND ')}
         GROUP BY s.spot_id ORDER BY ${orderBySql} LIMIT 50`,
        queryValues
    );

    const savedSpots = savedSpotsResult.rows.map(s => ({
        ...s, x: Number(s.x), y: Number(s.y),
        recommend_pct: s.recommend_pct == null ? null : Number(s.recommend_pct),
        tags: s.tags || [],
        top_tags: s.tags || [],
        is_saved: true, has_app_data: true, filter_match: 'matched', result_group: 'saved_spot',
    }));

    const kakaoCandidates = kakaoSpots
        .filter(s => !savedKakaoPlaceIdSet.has(s.kakao_place_id))
        .map(s => ({
            ...s, is_saved: false, has_app_data: false, tags: [], recommend_pct: null,
            filter_match: tagIdList.length > 0 || minRecommendPct !== null ? 'unknown' : 'category_only',
            result_group: 'kakao_candidate',
        }));

    return {
        category,
        filters: { keyword, category: category || null, region: region || null, tag_ids: tagIdList, min_recommend_pct: minRecommendPct },
        raw_count: kakaoSpots.length,
        saved_count: savedSpots.length,
        kakao_candidate_count: kakaoCandidates.length,
        total_count: savedSpots.length + kakaoCandidates.length,
        saved_spots: savedSpots,
        kakao_candidates: kakaoCandidates,
        spots: [...savedSpots, ...kakaoCandidates],
    };
};

