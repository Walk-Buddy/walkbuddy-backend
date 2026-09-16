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

function loadGeneratedMappings() {
  const filePath = path.join(__dirname, 'durunubiSpotMappings.generated.json');
  if (!fs.existsSync(filePath)) {
    return { byCourse: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { byCourse: parsed.byCourse || {} };
  } catch (err) {
    console.warn(`[durunubi mappings] generated mapping file ignored: ${err.message}`);
    return { byCourse: {} };
  }
}

const GENERATED_DURUNUBI_SPOT_MAPPINGS = loadGeneratedMappings();

function getDurunubiCourseSpotMappings(courseName) {
  const key = courseName ? String(courseName).trim() : '';
  if (!key) return [];
  return GENERATED_DURUNUBI_SPOT_MAPPINGS.byCourse[key] || [];
}

module.exports = {
  GENERATED_DURUNUBI_SPOT_MAPPINGS,
  getDurunubiCourseSpotMappings,
  normalizeDurunubiSpotName,
};
