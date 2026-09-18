const axios = require("axios");
const { resolveRegion, TARGET_REGIONS } = require("../constants/spotCategoryRules");

const BASE_URL = "http://apis.data.go.kr/B551011/KorService1";
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
 * 서울(노원구) / 춘천 대상
 */
exports.getFestivals = async ({ region, eventStartDate, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.NOWON;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const startDate = eventStartDate || today;

  const data = await requestTourApi("searchFestival1", {
    areaCode: target.tourApi.areaCode,
    sigunguCode: target.tourApi.sigunguCode,
    eventStartDate: startDate,
    pageNo: page,
    numOfRows: limit,
    arrange: "A", // 제목순(A), 수정일순(B), 생성일순(C), 인기순(P)
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
    requestTourApi("detailCommon1", {
      contentId,
      defaultYN: "Y",
      firstImageYN: "Y",
      areacodeYN: "Y",
      catcodeYN: "Y",
      addrinfoYN: "Y",
      mapinfoYN: "Y",
      overviewYN: "Y",
    }),
    requestTourApi("detailImage1", {
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
 * 3. 실시간 열린관광(무장애 관광) 편의시설 정보 조회 (detailWithTour)
 */
exports.getBarrierFreeInfo = async (contentId) => {
  if (!contentId) {
    const err = new Error("contentId는 필수입니다.");
    err.status = 400;
    throw err;
  }

  const data = await requestTourApi("detailWithTour1", {
    contentId,
  });

  const [item] = getItems(data);
  if (!item) {
    return {
      content_id: contentId,
      has_barrier_free_info: false,
      details: null,
    };
  }

  return {
    content_id: contentId,
    has_barrier_free_info: true,
    details: {
      parking: item.parking || null, // 장애인 주차구역
      route: item.route || null, // 접근 경사로
      public_transport: item.publictransport || null, // 대중교통 접근성
      wheelchair: item.wheelchair || null, // 휠체어 대여
      disabled_restroom: item.restroom || null, // 장애인 화장실
      elevator: item.elevator || null, // 엘리베이터
      braileblock: item.braileblock || null, // 점자블록
      help_dog: item.helpdog || null, // 보조견 동반
      audio_guide: item.audioguide || null, // 음성안내기
      sign_language: item.signlanguage || null, // 수어안내
      baby_carriage: item.babycarriage || null, // 유모차 대여
    },
  };
};

/**
 * 4. 실시간 지역/테마별 관광 스팟 목록 조회 (areaBasedList1)
 */
exports.getTourSpots = async ({ region, contentTypeId, cat1, cat2, cat3, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.NOWON;

  const params = {
    areaCode: target.tourApi.areaCode,
    sigunguCode: target.tourApi.sigunguCode,
    pageNo: page,
    numOfRows: limit,
    arrange: "P", // 인기순
  };

  if (contentTypeId) params.contentTypeId = contentTypeId;
  if (cat1) params.cat1 = cat1;
  if (cat2) params.cat2 = cat2;
  if (cat3) params.cat3 = cat3;

  const data = await requestTourApi("areaBasedList1", params);
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
 * 5. 실시간 키워드 관광지 검색 (searchKeyword1)
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

  const data = await requestTourApi("searchKeyword1", params);
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
