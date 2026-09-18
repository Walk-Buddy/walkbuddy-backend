const axios = require("axios");
const { resolveRegion, TARGET_REGIONS, inferSpotCategories, inferSpotCategoriesWithFallback, extractRegionFromAddress } = require("../constants/spotCategoryRules");
const pool = require("../config/db");

const BASE_URL = "https://apis.data.go.kr/B551011/KorService2";
const WITH_TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2"; // 무장애 여행정보 API
const PET_TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2"; // 반려동물 동반여행 API
const PHOTO_BASE_URL = "https://apis.data.go.kr/B551011/PhotoGalleryService1"; // 관광사진 API
const DEFAULT_MOBILE_OS = "ETC";
const DEFAULT_MOBILE_APP = "WalkBuddy";

// TOURAPI_SERVICE_KEY 또는 기존 키 fallback
function getServiceKey() {
  return (
    process.env.TOURAPI_SERVICE_KEY ||
    process.env.TOUR_API_KEY ||
    process.env.DURUNUBI_SERVICE_KEY ||
    ""
  );
}

function getWithTourServiceKey() {
  return (
    process.env.KOR_WITH_SERVICE_KEY ||
    getServiceKey()
  );
}

function getPetTourServiceKey() {
  return (
    process.env.KOR_PET_TOUR_SERVICE_KEY ||
    process.env.TOURAPI_SERVICE_KEY ||
    getServiceKey()
  );
}

const http = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "WalkBuddy-TourAPI-Client/1.0",
  },
});

function buildUrl(pathname, params = {}) {
  const serviceKey = getServiceKey();
  if (!serviceKey) {
    throw new Error("TOURAPI_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const url = new URL(`${BASE_URL}/${pathname}`);
  const defaultParams = {
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: "json",
  };

  Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  });

  if (serviceKey.includes("%")) {
    return `${url.toString()}&serviceKey=${serviceKey}`;
  }

  url.searchParams.append("serviceKey", serviceKey);
  return url.toString();
}

async function requestTourApi(pathname, params = {}) {
  const url = buildUrl(pathname, params);
  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      const err = new Error(header.resultMsg || "TourAPI 호출 실패");
      err.code = header.resultCode;
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      const authErr = new Error("한국관광공사 TourAPI 인증 실패: TOURAPI_SERVICE_KEY를 확인해주세요.");
      authErr.status = 401;
      throw authErr;
    }
    throw err;
  }
}

function buildWithTourUrl(pathname, params = {}) {
  const serviceKey = getWithTourServiceKey();
  if (!serviceKey) {
    throw new Error("KOR_WITH_SERVICE_KEY 또는 TOURAPI_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const url = new URL(`${WITH_TOUR_BASE_URL}/${pathname}`);
  const defaultParams = {
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: "json",
  };

  Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  });

  if (serviceKey.includes("%")) {
    return `${url.toString()}&serviceKey=${serviceKey}`;
  }

  url.searchParams.append("serviceKey", serviceKey);
  return url.toString();
}

async function requestWithTourApi(pathname, params = {}) {
  const url = buildWithTourUrl(pathname, params);
  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      if (header.resultCode === "03") {
        return { response: { body: { items: { item: [] }, totalCount: 0 } } };
      }
      const err = new Error(header.resultMsg || "무장애 TourAPI 호출 실패");
      err.code = header.resultCode;
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      const authErr = new Error("한국관광공사 무장애 TourAPI 인증 실패: 서비스 키를 확인해주세요.");
      authErr.status = 401;
      throw authErr;
    }
    throw err;
  }
}

function buildPetTourUrl(pathname, params = {}) {
  const serviceKey = getPetTourServiceKey();
  if (!serviceKey) {
    throw new Error("KOR_PET_TOUR_SERVICE_KEY 또는 TOURAPI_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const url = new URL(`${PET_TOUR_BASE_URL}/${pathname}`);
  const defaultParams = {
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: "json",
  };

  Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  });

  if (serviceKey.includes("%")) {
    return `${url.toString()}&serviceKey=${serviceKey}`;
  }

  url.searchParams.append("serviceKey", serviceKey);
  return url.toString();
}

async function requestPetTourApi(pathname, params = {}) {
  const url = buildPetTourUrl(pathname, params);
  try {
    const { data } = await http.get(url);
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      if (header.resultCode === "03") {
        return { response: { body: { items: { item: [] }, totalCount: 0 } } };
      }
      const err = new Error(header.resultMsg || "반려동물 TourAPI 호출 실패");
      err.code = header.resultCode;
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      const authErr = new Error("한국관광공사 반려동물 TourAPI 인증 실패: 서비스 키를 확인해주세요.");
      authErr.status = 401;
      throw authErr;
    }
    throw err;
  }
}

function getItems(data) {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function getTotalCount(data) {
  return Number(data?.response?.body?.totalCount || 0);
}

/**
 * 1. 실시간 축제/행사 조회 (searchFestival1)
 * 서울 25개 구 / 춘천시 대상
 */
exports.getFestivals = async ({ region, eventStartDate, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.CHUNCHEON;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const startDate = eventStartDate || today;

  const data = await requestTourApi("searchFestival2", {
    areaCode: target.tourApi.areaCode,
    sigunguCode: target.tourApi.sigunguCode,
    eventStartDate: startDate,
    pageNo: page,
    numOfRows: limit,
    arrange: "A",
  });

  const rawItems = getItems(data);
  const festivals = rawItems.map((item) => ({
    content_id: item.contentid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    event_start_date: item.eventstartdate,
    event_end_date: item.eventenddate,
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    region: target.name,
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    region: target.name,
    festivals,
  };
};

/**
 * 2. 실시간 스팟 상세 및 이미지 갤러리 조회 (detailCommon1 + detailImage1)
 */
exports.getSpotDetail = async (contentId) => {
  if (!contentId) {
    const err = new Error("contentId는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const [commonData, imageData] = await Promise.all([
    requestTourApi("detailCommon2", {
      contentId,
    }),
    requestTourApi("detailImage2", {
      contentId,
      imageYN: "Y",
      subImageYN: "Y",
    }).catch(() => null),
  ]);

  const [commonItem] = getItems(commonData);
  if (!commonItem) {
    const err = new Error("해당 관광지 정보를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const rawImages = imageData ? getItems(imageData) : [];
  const images = rawImages.map((img) => ({
    image_url: img.originimgurl,
    small_image_url: img.smallimageurl,
    image_name: img.imgname || null,
  }));

  if (commonItem.firstimage && !images.some((i) => i.image_url === commonItem.firstimage)) {
    images.unshift({
      image_url: commonItem.firstimage,
      small_image_url: commonItem.firstimage2 || commonItem.firstimage,
      image_name: commonItem.title,
    });
  }

  return {
    content_id: commonItem.contentid,
    content_type_id: commonItem.contenttypeid,
    title: commonItem.title,
    overview: commonItem.overview || null,
    homepage: commonItem.homepage || null,
    tel: commonItem.tel || null,
    address: commonItem.addr1 + (commonItem.addr2 ? " " + commonItem.addr2 : ""),
    zipcode: commonItem.zipcode || null,
    x: commonItem.mapx ? Number(commonItem.mapx) : null,
    y: commonItem.mapy ? Number(commonItem.mapy) : null,
    images,
  };
};

/**
 * 3. 실시간 열린관광(무장애 관광) 편의시설 정보 조회 (detailWithTour2)
 */
exports.getBarrierFreeInfo = async (contentId) => {
  if (!contentId) {
    const err = new Error("contentId는 필수입니다.");
    err.status = 400;
    throw err;
  }

  let data;
  try {
    data = await requestWithTourApi("detailWithTour2", { contentId });
  } catch (e) {
    data = await requestTourApi("detailWithTour1", { contentId }).catch(() => null);
  }

  const [item] = data ? getItems(data) : [];
  if (!item) {
    return {
      content_id: contentId,
      has_barrier_free_info: false,
      summary_tags: [],
      details: null,
    };
  }

  const summaryTags = [];
  if (item.parking) summaryTags.push("#주차가능");
  if (item.restroom) summaryTags.push("#화장실");
  if (item.audioguide) summaryTags.push("#음성해설");
  if (item.helpdog) summaryTags.push("#반려견동반");
  if (item.wheelchair || item.route) summaryTags.push("#열린관광");

  return {
    content_id: contentId,
    has_barrier_free_info: true,
    summary_tags: summaryTags,
    details: {
      physical: {
        parking: item.parking || null,
        route: item.route || null,
        wheelchair: item.wheelchair || null,
        restroom: item.restroom || null,
        elevator: item.elevator || null,
        exit: item.exit || null,
        ticket_office: item.ticketoffice || null,
      },
      visual: {
        braile_block: item.braileblock || null,
        help_dog: item.helpdog || null,
        audio_guide: item.audioguide || null,
        guide_human: item.guidehuman || null,
        braile_promotion: item.brailepromotion || null,
      },
      hearing: {
        sign_language: item.signguide || item.signlanguage || null,
        video_guide: item.videoguide || null,
      },
      infant: {
        stroller: item.stroller || item.babycarriage || null,
        lactation_room: item.lactationroom || null,
        baby_spare_chair: item.babysparechair || null,
      },
      general: {
        public_transport: item.publictransport || null,
      },
    },
  };
};

/**
 * 3-1. 실시간 지역별 열린관광(무장애 인증) 스팟 목록 조회 (areaBasedList2)
 */
exports.getBarrierFreeSpots = async ({ region, contentTypeId, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.CHUNCHEON;

  const params = {
    areaCode: target.tourApi.areaCode,
    pageNo: page,
    numOfRows: limit,
    arrange: "C",
  };

  if (target.tourApi.sigunguCode) {
    params.sigunguCode = target.tourApi.sigunguCode;
  }
  if (contentTypeId) {
    params.contentTypeId = contentTypeId;
  }

  const data = await requestWithTourApi("areaBasedList2", params);
  const rawItems = getItems(data);

  const spots = rawItems.map((item) => ({
    content_id: item.contentid,
    content_type_id: item.contenttypeid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    cat1: item.cat1 || null,
    cat2: item.cat2 || null,
    cat3: item.cat3 || null,
    region: target.name,
    is_barrier_free: true,
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    region: target.name,
    spots,
  };
};

/**
 * 3-2. 실시간 열린관광(무장애) 키워드 검색 (searchKeyword2)
 */
exports.searchBarrierFreePlaces = async ({ region, keyword, page = 1, limit = 10 } = {}) => {
  if (!keyword || !keyword.trim()) {
    const err = new Error("keyword는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const target = resolveRegion(region);
  const params = {
    keyword: keyword.trim(),
    pageNo: page,
    numOfRows: limit,
    arrange: "P",
  };

  if (target) {
    params.areaCode = target.tourApi.areaCode;
    if (target.tourApi.sigunguCode) {
      params.sigunguCode = target.tourApi.sigunguCode;
    }
  }

  const data = await requestWithTourApi("searchKeyword2", params);
  const rawItems = getItems(data);

  const spots = rawItems.map((item) => ({
    content_id: item.contentid,
    content_type_id: item.contenttypeid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    region: target ? target.name : "전체",
    is_barrier_free: true,
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    keyword: keyword.trim(),
    spots,
  };
};

function mapCategoryToTourParams(category) {
  if (!category) return {};
  const cat = String(category).trim();

  if (cat === '카페·맛집' || cat === '카페' || cat === '음식점' || cat.includes('맛집')) {
    return { contentTypeId: '39' };
  }
  if (cat === '전시·문화공간' || cat === '박물관' || cat === '미술관' || cat.includes('전시') || cat.includes('문화')) {
    return { contentTypeId: '14' };
  }
  if (cat === '전통시장·로컬마켓' || cat === '시장' || cat === '전통시장' || cat.includes('쇼핑')) {
    return { contentTypeId: '38' };
  }
  if (cat === '역사·유적' || cat.includes('유적') || cat.includes('고궁') || cat.includes('사찰')) {
    return { contentTypeId: '12', cat2: 'A0201' };
  }
  if (cat === '산·등산로' || cat === '산' || cat.includes('등산')) {
    return { contentTypeId: '12', cat2: 'A0101' };
  }
  if (cat === '숲·휴양림' || cat.includes('휴양림') || cat.includes('숲')) {
    return { contentTypeId: '12', cat2: 'A0102' };
  }
  if (cat === '수목원·정원' || cat.includes('수목원') || cat.includes('정원')) {
    return { contentTypeId: '12', cat2: 'A0101' };
  }
  if (cat === '공원·광장' || cat === '강·하천' || cat === '호수·저수지' || cat.includes('공원')) {
    return { contentTypeId: '12' };
  }

  return {};
}

/**
 * 4. 실시간 지역/테마/위치별 관광 스팟 목록 조회 (areaBasedList2 / locationBasedList2)
 */
exports.getTourSpots = async ({
  region,
  sub_region,
  contentTypeId,
  cat1,
  cat2,
  cat3,
  category,
  tag_ids,
  min_recommend_pct,
  latitude,
  longitude,
  radius,
  page = 1,
  limit = 10,
} = {}) => {
  const targetRegionInput = sub_region || region;
  const target = resolveRegion(targetRegionInput) || resolveRegion(region) || TARGET_REGIONS.CHUNCHEON;

  const hasCoordinates =
    latitude != null &&
    longitude != null &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude));

  const categoryTourParams = mapCategoryToTourParams(category);
  const effectiveContentTypeId = contentTypeId || categoryTourParams.contentTypeId;
  const effectiveCat1 = cat1 || categoryTourParams.cat1;
  const effectiveCat2 = cat2 || categoryTourParams.cat2;
  const effectiveCat3 = cat3 || categoryTourParams.cat3;

  let data;
  let targetName = target ? target.name : "서울";

  if (hasCoordinates) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rad = radius ? Number(radius) : 3000;

    const locationParams = {
      mapX: lng,
      mapY: lat,
      radius: Math.min(Math.max(rad, 100), 20000),
      pageNo: page,
      numOfRows: limit,
      arrange: "E",
    };

    if (effectiveContentTypeId) locationParams.contentTypeId = effectiveContentTypeId;
    if (effectiveCat1) locationParams.cat1 = effectiveCat1;
    if (effectiveCat2) locationParams.cat2 = effectiveCat2;
    if (effectiveCat3) locationParams.cat3 = effectiveCat3;

    data = await requestTourApi("locationBasedList2", locationParams);
  } else {
    const params = {
      areaCode: target.tourApi.areaCode,
      sigunguCode: target.tourApi.sigunguCode,
      pageNo: page,
      numOfRows: limit,
      arrange: "P",
    };

    if (effectiveContentTypeId) params.contentTypeId = effectiveContentTypeId;
    if (effectiveCat1) params.cat1 = effectiveCat1;
    if (effectiveCat2) params.cat2 = effectiveCat2;
    if (effectiveCat3) params.cat3 = effectiveCat3;

    data = await requestTourApi("areaBasedList2", params);
  }

  const rawItems = getItems(data);

  let spots = rawItems.map((item) => {
    const itemRegionInfo = extractRegionFromAddress(item.addr1);
    const itemCategories = inferSpotCategoriesWithFallback({
      place_name: item.title,
      name: item.title,
      category_name: item.cat3 || item.cat2 || item.cat1 || "",
    });

    return {
      content_id: item.contentid,
      content_type_id: item.contenttypeid,
      title: item.title,
      address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
      image_url: item.firstimage || item.firstimage2 || null,
      tel: item.tel || null,
      x: item.mapx ? Number(item.mapx) : null,
      y: item.mapy ? Number(item.mapy) : null,
      cat1: item.cat1 || null,
      cat2: item.cat2 || null,
      cat3: item.cat3 || null,
      region: itemRegionInfo.region || targetName,
      categories: itemCategories,
      recommend_pct: null,
      tags: [],
    };
  });

  // DB 연동 및 추천도/태그 보강
  if (spots.length > 0) {
    try {
      const titles = spots.map((s) => s.title);
      const dbSpotsResult = await pool.query(
        `SELECT s.spot_id, s.name, s.recommend_pct,
                COALESCE(json_agg(DISTINCT jsonb_build_object('tag_id', t.tag_id, 'name', t.name))
                FILTER (WHERE t.tag_id IS NOT NULL), '[]') AS tags
         FROM spots s
         LEFT JOIN taggings tg ON tg.target_id = s.spot_id AND tg.target_type = 'spot'
         LEFT JOIN tags t ON t.tag_id = tg.tag_id AND t.is_active = TRUE
         WHERE s.name = ANY($1::TEXT[]) AND s.status = 'active'
         GROUP BY s.spot_id`,
        [titles]
      );

      if (dbSpotsResult.rows.length > 0) {
        const dbMap = new Map();
        for (const row of dbSpotsResult.rows) {
          dbMap.set(row.name, row);
        }

        spots = spots.map((s) => {
          const dbSpot = dbMap.get(s.title);
          if (dbSpot) {
            return {
              ...s,
              recommend_pct: dbSpot.recommend_pct == null ? null : Number(dbSpot.recommend_pct),
              tags: dbSpot.tags || [],
            };
          }
          return s;
        });
      }
    } catch (dbErr) {
      console.error("TourAPI spots DB enrichment error:", dbErr.message);
    }
  }

  // 필터링: category
  if (category && String(category).trim()) {
    const targetCat = String(category).trim();
    if (!effectiveContentTypeId) {
      spots = spots.filter(
        (s) =>
          s.categories.includes(targetCat) ||
          s.categories.some((c) => c.includes(targetCat) || targetCat.includes(c))
      );
    }
  }

  // 필터링: min_recommend_pct
  if (min_recommend_pct != null && min_recommend_pct !== "") {
    const minPct = Number(min_recommend_pct);
    if (!isNaN(minPct) && minPct >= 0 && minPct <= 100) {
      spots = spots.filter(
        (s) => s.recommend_pct != null && s.recommend_pct >= minPct
      );
    }
  }

  // 필터링: tag_ids
  if (tag_ids && String(tag_ids).trim()) {
    const targetTagIdList = (Array.isArray(tag_ids) ? tag_ids.join(",") : String(tag_ids))
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (targetTagIdList.length > 0) {
      spots = spots.filter((s) => {
        const spotTagIds = new Set((s.tags || []).map((t) => t.tag_id));
        return targetTagIdList.every((id) => spotTagIds.has(id));
      });
    }
  }

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    region: targetName,
    spots,
  };
};


/**
 * 5. 실시간 키워드 관광지 검색 (searchKeyword2)
 */
exports.searchTourPlaces = async ({ region, keyword, page = 1, limit = 10 } = {}) => {
  if (!keyword || !keyword.trim()) {
    const err = new Error("keyword는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const target = resolveRegion(region);
  const params = {
    keyword: keyword.trim(),
    pageNo: page,
    numOfRows: limit,
    arrange: "P",
  };

  if (target) {
    params.areaCode = target.tourApi.areaCode;
    params.sigunguCode = target.tourApi.sigunguCode;
  }

  const data = await requestTourApi("searchKeyword2", params);
  const rawItems = getItems(data);

  const spots = rawItems.map((item) => ({
    content_id: item.contentid,
    content_type_id: item.contenttypeid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    region: target ? target.name : "전체",
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    keyword: keyword.trim(),
    spots,
  };
};

/**
 * 6. 관광사진 키워드 검색 (PhotoGalleryService1 - galleryList1)
 */
exports.getPhotosByKeyword = async (keyword, limit = 10) => {
  if (!keyword || !keyword.trim()) {
    const err = new Error("keyword는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const serviceKey = getServiceKey();
  if (!serviceKey) {
    throw new Error("TOURAPI_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const url = new URL(`${PHOTO_BASE_URL}/galleryList1`);
  url.searchParams.append("serviceKey", serviceKey);
  url.searchParams.append("MobileOS", DEFAULT_MOBILE_OS);
  url.searchParams.append("MobileApp", DEFAULT_MOBILE_APP);
  url.searchParams.append("_type", "json");
  url.searchParams.append("keyword", keyword.trim());
  url.searchParams.append("numOfRows", String(limit));
  url.searchParams.append("pageNo", "1");

  try {
    const { data } = await http.get(url.toString());
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      if (header.resultCode === "03") return [];
      const err = new Error(header.resultMsg || "관광사진 API 호출 실패");
      err.code = header.resultCode;
      err.status = 502;
      throw err;
    }

    const item = data?.response?.body?.items?.item;
    const rawItems = !item ? [] : Array.isArray(item) ? item : [item];

    return rawItems.map((img) => ({
      thumbnail: img.galWebImageUrl || img.galThumbnailImage || null,
      original: img.galWebImageUrl || null,
      title: img.galTitle || null,
    }));
  } catch (err) {
    if (err.status) throw err;
    console.error("[PhotoGallery API 오류]", err.message);
    return [];
  }
};

/**
 * 7. 스팟 사진 조회 (혼합 전략)
 */
exports.getSpotPhotos = async (contentId, spotName) => {
  if (contentId) {
    try {
      const data = await requestTourApi("detailImage2", {
        contentId,
        imageYN: "Y",
        subImageYN: "Y",
      });

      const rawItems = getItems(data);
      const photos = rawItems.map((img) => ({
        thumbnail: img.smallimageurl || img.originimgurl || null,
        original: img.originimgurl || null,
        title: img.imgname || null,
      }));

      if (photos.length > 0) {
        return { source: "detailImage2", photos };
      }
    } catch (err) {
      console.error("[detailImage2 실패, galleryList1으로 fallback]", err.message);
    }
  }

  if (spotName) {
    const photos = await exports.getPhotosByKeyword(spotName);
    return { source: "galleryList1", photos };
  }

  return { source: null, photos: [] };
};

/**
 * 8. 코스 사진 조회 (galleryList1 키워드 검색)
 */
exports.getCoursePhotos = async (courseName) => {
  if (!courseName) return { source: null, photos: [] };
  const photos = await exports.getPhotosByKeyword(courseName);
  return { source: "galleryList1", photos };
};

/**
 * 9. 실시간 반려동물 동반 상세 정보 조회 (KorPetTourService2 - detailPetTour2)
 * @param {string} contentId - TourAPI content_id
 */
exports.getPetTourDetail = async (contentId) => {
  if (!contentId) {
    const err = new Error("contentId는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const data = await requestPetTourApi("detailPetTour2", { contentId });
  const [item] = data ? getItems(data) : [];

  if (!item) {
    return {
      content_id: contentId,
      has_pet_info: false,
      summary_tags: [],
      details: null,
    };
  }

  // 표준 11개 스팟 태그에 매핑 가능한 요약 태그 추출
  const summaryTags = ["#반려견동반"];
  const facilities = item.relaPosesFclty || "";
  if (facilities.includes("주차") || facilities.includes("주차장")) summaryTags.push("#주차가능");
  if (facilities.includes("화장실") || facilities.includes("배변")) summaryTags.push("#화장실");
  if (facilities.includes("쉼터") || facilities.includes("벤치") || facilities.includes("놀이터")) summaryTags.push("#벤치·쉼터");

  return {
    content_id: contentId,
    has_pet_info: true,
    summary_tags: summaryTags,
    details: {
      pet_tour_info: item.petTursmInfo || null,
      accident_risk: item.relaAcdntRiskMtr || null,
      accompany_type: item.acmpyTypeCd || null,
      facilities: item.relaPosesFclty || null,
      furnished_items: item.relaFrnshPrdlst || null,
      purchasable_items: item.relaPurcPrdlst || null,
      rentable_items: item.relaRntlPrdlst || null,
      allowed_pet_size: item.acmpyPsblCpam || null,
      recommend_pet_pattern: item.rcmndPamt || null,
      extra_fee: item.relaExpnTrrsAmnt || null,
      etc_info: item.etcAcmpyInfo || null,
    },
  };
};

/**
 * 10. 실시간 지역별 반려동물 동반 관광지 목록 조회 (KorPetTourService2 - areaBasedList2)
 * LBS 미신고 안전: 스마트폰 실시간 GPS 대신 서울(25개 구) / 춘천시 지역코드만 사용
 */
exports.getPetTourSpots = async ({ region, contentTypeId, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.CHUNCHEON;

  const params = {
    areaCode: target.tourApi.areaCode,
    pageNo: page,
    numOfRows: limit,
    arrange: "C", // 최신 수정일순
  };

  if (target.tourApi.sigunguCode) {
    params.sigunguCode = target.tourApi.sigunguCode;
  }
  if (contentTypeId) {
    params.contentTypeId = contentTypeId;
  }

  const data = await requestPetTourApi("areaBasedList2", params);
  const rawItems = getItems(data);

  const spots = rawItems.map((item) => ({
    content_id: item.contentid,
    content_type_id: item.contenttypeid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    cat1: item.cat1 || null,
    cat2: item.cat2 || null,
    cat3: item.cat3 || null,
    region: target.name,
    is_pet_friendly: true,
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    region: target.name,
    spots,
  };
};

/**
 * 11. 실시간 반려동물 동반 관광지 키워드 검색 (KorPetTourService2 - searchKeyword2)
 */
exports.searchPetTourPlaces = async ({ region, keyword, contentTypeId, page = 1, limit = 10 } = {}) => {
  if (!keyword || !keyword.trim()) {
    const err = new Error("keyword는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const target = resolveRegion(region);
  const params = {
    keyword: keyword.trim(),
    pageNo: page,
    numOfRows: limit,
    arrange: "P", // 인기순
  };

  if (target) {
    params.areaCode = target.tourApi.areaCode;
    if (target.tourApi.sigunguCode) {
      params.sigunguCode = target.tourApi.sigunguCode;
    }
  }
  if (contentTypeId) {
    params.contentTypeId = contentTypeId;
  }

  const data = await requestPetTourApi("searchKeyword2", params);
  const rawItems = getItems(data);

  const spots = rawItems.map((item) => ({
    content_id: item.contentid,
    content_type_id: item.contenttypeid,
    title: item.title,
    address: item.addr1 + (item.addr2 ? " " + item.addr2 : ""),
    image_url: item.firstimage || item.firstimage2 || null,
    tel: item.tel || null,
    x: item.mapx ? Number(item.mapx) : null,
    y: item.mapy ? Number(item.mapy) : null,
    region: target ? target.name : "전체",
    is_pet_friendly: true,
  }));

  return {
    total: getTotalCount(data),
    page: Number(page),
    limit: Number(limit),
    keyword: keyword.trim(),
    spots,
  };
};
