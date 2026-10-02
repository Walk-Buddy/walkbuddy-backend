/**
 * utils/courseDescription.js
 *
 * 두루누비 등 공공데이터 코스의 description 문자열(@@section 포맷)을 파싱하는 공용 유틸.
 * courseService 와 백필 스크립트가 함께 사용한다.
 *
 * description 예:
 *   @@summary
 *   - 한강을 따라 걷는 코스
 *
 *   @@content
 *   ...
 */

function parseListLines(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function parseTravelerInfo(text) {
  if (!text) {
    return { list: [], stampLocation: null };
  }

  const stampMatch = text.match(/\*\s*[^\n]*스탬프함 위치\n([\s\S]*)/);

  const travelerText = stampMatch
    ? text.slice(0, stampMatch.index).trim()
    : text.trim();

  return {
    list: parseListLines(travelerText),
    stampLocation: stampMatch ? stampMatch[1].trim() : null,
  };
}

function parseDescriptionSections(description) {
  const sections = {
    summary: [],
    content: null,
    tour_info: [],
    traveler_info: [],
    stamp_location: null,
    region: null,
    cycle: null,
  };

  if (!description) return sections;

  const blocks = description
    .split(/\n(?=@@)/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const [firstLine, ...bodyLines] = block.split('\n');
    const key = firstLine.replace(/^@@/, '').trim();
    const body = bodyLines.join('\n').trim();

    if (key === 'summary') {
      sections.summary = parseListLines(body);
    }
    if (key === 'content') {
      sections.content = body || null;
    }
    if (key === 'tour_info') {
      sections.tour_info = parseListLines(body);
    }
    if (key === 'traveler_info') {
      const { list, stampLocation } = parseTravelerInfo(body);
      sections.traveler_info = list;
      sections.stamp_location = stampLocation;
    }
    if (key === 'region') {
      sections.region = body || null;
    }
    if (key === 'cycle') {
      sections.cycle = body || null;
    }
  }

  return sections;
}

function cleanText(value) {
  if (!value) return null;

  return decodeHtmlEntities(String(value))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

module.exports = {
  cleanText,
  decodeHtmlEntities,
  parseDescriptionSections,
  parseListLines,
  parseTravelerInfo,
};
