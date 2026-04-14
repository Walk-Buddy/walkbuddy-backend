// ─────────────────────────────────────────────────────────────────────
//  Course Calculator  (Day 3: 코스 정보 자동 계산)
// ─────────────────────────────────────────────────────────────────────

const CourseCalculator = {

  /**
   * 세그먼트 배열로 총 거리(km) 합산
   */
  calcTotalDistance(segments) {
    const total = segments.reduce((sum, s) => sum + (s.distance || 0), 0);
    return Math.round(total * 100) / 100;
  },

  /**
   * 총 거리(km) → 예상 소요시간(분), 평균 도보 4km/h 기준
   */
  calcEstimatedMinutes(totalDistanceKm) {
    return Math.round((totalDistanceKm / 4) * 60);
  },

  /**
   * 난이도 자동 결정
   * 1: 쉬움  (~3km)
   * 2: 보통  (3~7km)
   * 3: 어려움 (7km~)
   */
  calcDifficulty(totalDistanceKm) {
    if (totalDistanceKm < 3) return 1;
    if (totalDistanceKm < 7) return 2;
    return 3;
  },

  /**
   * 세그먼트 배열로 한번에 계산
   * @returns {{ totalDistanceKm, estimatedMinutes, difficulty }}
   */
  calcAll(segments) {
    const totalDistanceKm = this.calcTotalDistance(segments);
    const estimatedMinutes = this.calcEstimatedMinutes(totalDistanceKm);
    const difficulty = this.calcDifficulty(totalDistanceKm);
    return { totalDistanceKm, estimatedMinutes, difficulty };
  },
};

module.exports = CourseCalculator;