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

const MANUAL_DURUNUBI_SPOT_MAPPINGS = {
  절영해안길: {
    canonicalName: '절영해안산책로',
    kakaoKeywords: ['절영해안산책로', '영도 절영해안산책로'],
    tourApiKeywords: ['절영해안산책로'],
    tourApiContentId: '252561',
  },
  '자갈치 수산시장': {
    canonicalName: '자갈치시장',
    kakaoKeywords: ['자갈치시장', '부산 자갈치시장'],
    tourApiKeywords: ['부산 자갈치시장', '자갈치시장'],
    tourApiContentId: '132190',
  },
  웅천안골왜성: {
    canonicalName: '창원 안골왜성',
    kakaoKeywords: ['창원 안골왜성', '안골왜성'],
    tourApiKeywords: ['웅천안골왜성', '창원 안골왜성'],
    tourApiContentId: '128675',
  },
  창원해양공원: {
    canonicalName: '진해해양공원',
    kakaoKeywords: ['진해해양공원', '창원 진해해양공원'],
    tourApiKeywords: ['진해해양공원', '창원해양공원'],
  },
  창원시립마산문신미술관: {
    canonicalName: '창원시립문신미술관',
    kakaoKeywords: ['창원시립문신미술관', '창원시립마산문신미술관', '문신미술관'],
    tourApiKeywords: ['창원시립마산문신미술관', '창원시립문신미술관'],
    tourApiContentId: '130086',
  },
  제말장군묘: {
    canonicalName: '제말장군의묘',
    kakaoKeywords: ['제말장군의묘', '제말장군묘', '제말장군 묘'],
    tourApiKeywords: ['제말장군묘', '제말장군의묘'],
  },
  아미산전망대: {
    canonicalName: '아미산전망대',
    kakaoKeywords: ['아미산전망대', '아미산 전망대'],
    tourApiKeywords: ['아미산 전망대', '아미산전망대'],
  },
  황포돛대노래비: {
    canonicalName: '황포돛대노래비',
    kakaoKeywords: ['황포돛대노래비', '황포돛대 노래비'],
    tourApiKeywords: ['황포돛대노래비', '황포돛대 노래비'],
  },
  주기철목사기념관: {
    canonicalName: '항일독립운동가 주기철목사기념관',
    kakaoKeywords: ['주기철목사기념관', '항일독립운동가 주기철목사기념관'],
    tourApiKeywords: ['주기철목사기념관', '항일독립운동가 주기철목사기념관'],
  },
};

function loadGeneratedMappings() {
  const filePath = path.join(__dirname, 'durunubiSpotMappings.generated.json');
  if (!fs.existsSync(filePath)) {
    return { byName: {}, byCourseAndName: {}, byCourse: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      byName: parsed.byName || {},
      byCourseAndName: parsed.byCourseAndName || {},
      byCourse: parsed.byCourse || {},
    };
  } catch (err) {
    console.warn(`[durunubi mappings] generated mapping file ignored: ${err.message}`);
    return { byName: {}, byCourseAndName: {}, byCourse: {} };
  }
}

const GENERATED_DURUNUBI_SPOT_MAPPINGS = loadGeneratedMappings();
const DURUNUBI_SPOT_MAPPINGS = {
  ...GENERATED_DURUNUBI_SPOT_MAPPINGS.byName,
  ...MANUAL_DURUNUBI_SPOT_MAPPINGS,
};

const normalizedMappingEntries = Object.entries(DURUNUBI_SPOT_MAPPINGS).map(([sourceName, mapping]) => ({
  sourceName,
  normalizedName: normalizeDurunubiSpotName(sourceName),
  mapping,
}));

function getDurunubiSpotMapping(spotName, context = {}) {
  const normalizedName = normalizeDurunubiSpotName(spotName);
  const courseName = context.courseName ? String(context.courseName).trim() : '';
  const courseSpecific = courseName
    ? GENERATED_DURUNUBI_SPOT_MAPPINGS.byCourseAndName[`${courseName}::${spotName}`]
    : null;
  if (courseSpecific) return courseSpecific;

  const courseSpot = courseName
    ? GENERATED_DURUNUBI_SPOT_MAPPINGS.byCourse[courseName]?.find((entry) => (
      normalizeDurunubiSpotName(entry.sourceName) === normalizedName
    ))
    : null;
  if (courseSpot?.mapping && Object.keys(courseSpot.mapping).length > 0) {
    return courseSpot.mapping;
  }

  const exact = normalizedMappingEntries.find((entry) => entry.normalizedName === normalizedName);
  if (exact) return exact.mapping;

  return normalizedMappingEntries.find((entry) => (
    normalizedName.includes(entry.normalizedName)
    || entry.normalizedName.includes(normalizedName)
  ))?.mapping || null;
}

function getDurunubiCourseSpotMappings(courseName) {
  const key = courseName ? String(courseName).trim() : '';
  if (!key) return [];
  return GENERATED_DURUNUBI_SPOT_MAPPINGS.byCourse[key] || [];
}

module.exports = {
  DURUNUBI_SPOT_MAPPINGS,
  GENERATED_DURUNUBI_SPOT_MAPPINGS,
  MANUAL_DURUNUBI_SPOT_MAPPINGS,
  getDurunubiCourseSpotMappings,
  getDurunubiSpotMapping,
  normalizeDurunubiSpotName,
};
