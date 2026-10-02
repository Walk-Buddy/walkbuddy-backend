const fs = require('fs');
const path = require('path');

function normalizeDurunubiSpotName(name = '') {
  return String(name)
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[·ㆍ.,'"]/g, '')
    .toLowerCase();
}

function loadJson(fileName, label) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[durunubi mappings] ${label} mapping file ignored: ${err.message}`);
    return null;
  }
}

function loadGeneratedMappings() {
  const parsed = loadJson('durunubiSpotMappings.generated.json', 'generated');
  return { byCourse: parsed?.byCourse || {} };
}

// 사람이 코스 설명을 보고 확정한 경유지 (scripts/curate-durunubi-spots.js 로 생성)
function loadCuratedMappings() {
  const parsed = loadJson('durunubiSpotMappings.curated.json', 'curated');
  return { courses: parsed?.courses || {} };
}

const GENERATED_DURUNUBI_SPOT_MAPPINGS = loadGeneratedMappings();
const CURATED_DURUNUBI_SPOT_MAPPINGS = loadCuratedMappings();

// 큐레이션 항목을 자동 생성 매핑과 같은 모양으로 맞춘다.
function toMappingEntries(curatedCourse) {
  return curatedCourse.spots.map((spot, index) => ({
    order: index + 1,
    sourceName: spot.sourceName,
    normalizedSourceName: normalizeDurunubiSpotName(spot.sourceName),
    status: spot.status || 'mapped',
    selection: 'curated',
    endpoint: spot.endpoint || null,
    routeProgress: spot.mapping.routeProgress ?? null,
    distanceFromStartM: spot.mapping.distanceFromStartM ?? null,
    mapping: spot.mapping,
  }));
}

// 큐레이션(crsIdx 기준)이 있으면 우선 사용하고, 없으면 자동 생성 매핑(코스명 기준)을 쓴다.
function getDurunubiCourseSpotMappings(courseName, crsIdx = null) {
  const curatedCourse = crsIdx ? CURATED_DURUNUBI_SPOT_MAPPINGS.courses[String(crsIdx)] : null;
  if (curatedCourse?.spots?.length) return toMappingEntries(curatedCourse);

  const key = courseName ? String(courseName).trim() : '';
  if (!key) return [];
  return GENERATED_DURUNUBI_SPOT_MAPPINGS.byCourse[key] || [];
}

module.exports = {
  GENERATED_DURUNUBI_SPOT_MAPPINGS,
  CURATED_DURUNUBI_SPOT_MAPPINGS,
  getDurunubiCourseSpotMappings,
  normalizeDurunubiSpotName,
};
