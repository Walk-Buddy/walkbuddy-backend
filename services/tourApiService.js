const axios = require("axios");
const { resolveRegion, TARGET_REGIONS } = require("../constants/spotCategoryRules");

const BASE_URL = "http://apis.data.go.kr/B551011/KorService1";
const WITH_TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2"; // 무장애 여행정보 API
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
      // 03: 데이터 없음
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
 * 3. 실시간 열린관광(무장애 관광) 5대 이동약자 편의시설 정보 조회 (detailWithTour2)
 * 지체장애, 시각장애, 청각장애, 영유아가족, 대중교통/공통 편의시설
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
    // KorWithService2 호출 실패 시 KorService1의 detailWithTour1으로 fallback
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

  // 11개 스팟 태그에 매핑할 수 있는 편의시설 요약 태그 자동 추출
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
      // 1. 지체장애 / 휠체어 이동 편의
      physical: {
        parking: item.parking || null, // 장애인 전용 주차구역
        route: item.route || null, // 주출입구 경사로/단차(턱) 여부
        wheelchair: item.wheelchair || null, // 휠체어 대여
        restroom: item.restroom || null, // 장애인 전용 화장실
        elevator: item.elevator || null, // 엘리베이터
        exit: item.exit || null, // 출입통로
        ticket_office: item.ticketoffice || null, // 매표소
      },
      // 2. 시각장애인 편의
      visual: {
        braile_block: item.braileblock || null, // 점자블록
        help_dog: item.helpdog || null, // 보조견/안내견 동반
        audio_guide: item.audioguide || null, // 음성안내기
        guide_human: item.guidehuman || null, // 유도안내 전문인력
        braile_promotion: item.brailepromotion || null, // 점자 홍보물
      },
      // 3. 청각장애인 편의
      hearing: {
        sign_language: item.signguide || item.signlanguage || null, // 수어안내
        video_guide: item.videoguide || null, // 영상 자막 안내
      },
      // 4. 영유아 동반 가족 / 부모 편의
      infant: {
        stroller: item.stroller || item.babycarriage || null, // 유모차 대여
        lactation_room: item.lactationroom || null, // 수유실
        baby_spare_chair: item.babysparechair || null, // 유아용 보조의자
      },
      // 5. 대중교통 및 일반 편의
      general: {
        public_transport: item.publictransport || null, // 대중교통 접근성
      },
    },
  };
};

/**
 * 3-1. 실시간 지역별 열린관광(무장애 인증) 스팟 목록 조회 (areaBasedList2)
 * LBS 미신고 안전: GPS 좌표 대신 서울(25개 구) / 춘천 지역코드만 사용
 */
exports.getBarrierFreeSpots = async ({ region, contentTypeId, page = 1, limit = 10 } = {}) => {
  const target = resolveRegion(region) || TARGET_REGIONS.SEOUL;

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

/**
 * 6. 관광사진 키워드 검색 (PhotoGalleryService1 - galleryList1)
 * content_id 없는 스팟·코스의 사진 fallback으로 사용
 * @param {string} keyword - 검색할 장소 이름
 * @param {number} limit   - 가져올 사진 수 (기본 10)
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

  // 관광사진 API는 BASE_URL이 달라서 직접 URL을 만들어요
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
      // 결과 없음(03)은 에러가 아니라 빈 배열로 처리
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
    return []; // 사진 API 실패는 서비스 전체를 막지 않음
  }
};

/**
 * 7. 스팟 사진 조회 (혼합 전략)
 * - content_id 있으면 → detailImage1 (정확도 높음)
 * - content_id 없으면 → galleryList1 keyword 검색 (fallback)
 * @param {string|null} contentId - TourAPI content_id (없으면 null)
 * @param {string}      spotName  - 스팟 이름 (fallback 검색용)
 */
exports.getSpotPhotos = async (contentId, spotName) => {
  // 방법 A: content_id가 있으면 detailImage1 우선 시도
  if (contentId) {
    try {
      const data = await requestTourApi("detailImage1", {
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
        return { source: "detailImage1", photos };
      }
      // 사진이 0장이면 아래 fallback으로 내려감
    } catch (err) {
      console.error("[detailImage1 실패, galleryList1으로 fallback]", err.message);
    }
  }

  // 방법 B: content_id 없거나 A가 빈 결과면 → 이름으로 관광사진 검색
  if (spotName) {
    const photos = await exports.getPhotosByKeyword(spotName);
    return { source: "galleryList1", photos };
  }

  return { source: null, photos: [] };
};

/**
 * 8. 코스 사진 조회 (galleryList1 키워드 검색)
 * 코스는 TourAPI content_id가 없으므로 이름으로만 검색
 * @param {string} courseName - 코스 이름
 */
exports.getCoursePhotos = async (courseName) => {
  if (!courseName) return { source: null, photos: [] };
  const photos = await exports.getPhotosByKeyword(courseName);
  return { source: "galleryList1", photos };
};
