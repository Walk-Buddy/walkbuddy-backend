const express = require("express");
const router = express.Router();
const tourController = require("../controllers/tourController");

// 실시간 축제/행사 조회 (서울 25개 구 / 춘천)
router.get("/festivals", tourController.getFestivals);

// 실시간 관광지 목록 조회
router.get("/spots", tourController.getTourSpots);

// 실시간 관광지 키워드 검색
router.get("/search", tourController.searchTourPlaces);

// 실시간 관광지 상세정보 및 갤러리 이미지
router.get("/spots/:content_id/detail", tourController.getSpotDetail);

// 실시간 열린관광(무장애 편의시설) 상세 정보
router.get("/spots/:content_id/barrier-free", tourController.getBarrierFreeInfo);

// 실시간 지역별 열린관광(무장애 인증) 스팟 목록 조회 (LBS 미신고 안전)
router.get("/barrier-free/spots", tourController.getBarrierFreeSpots);

// 실시간 열린관광(무장애) 키워드 검색
router.get("/barrier-free/search", tourController.searchBarrierFreePlaces);


// ── 반려동물 동반여행 (KorPetTourService2) ──────────────────────────────
// 실시간 특정 스팟의 반려동물 동반 상세 정보 (동반 가능 크기, 구비시설, 주의사항 등)
router.get("/spots/:content_id/pet", tourController.getPetTourDetail);

// 실시간 지역별 반려동물 동반 가능 스팟 목록 (LBS 미신고 안전)
router.get("/pet/spots", tourController.getPetTourSpots);

// 실시간 반려동물 동반 관광지 키워드 검색
router.get("/pet/search", tourController.searchPetTourPlaces);

module.exports = router;
