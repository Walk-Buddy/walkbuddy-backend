const pool = require('../config/db');

// 태그 그룹명 또는 태그 특성에 따른 전용 API 테마 매핑
const GROUP_API_THEME_MAP = {
  '열린관광': 'barrier-free',
  '무장애': 'barrier-free',
  '반려동물': 'pet',
  '반려견': 'pet',
};

function resolveApiTheme(groupName, tagName) {
  if (groupName && GROUP_API_THEME_MAP[groupName]) {
    return GROUP_API_THEME_MAP[groupName];
  }
  if (tagName && (tagName.includes('무장애') || tagName.includes('휠체어'))) {
    return 'barrier-free';
  }
  if (tagName && (tagName.includes('반려동물') || tagName.includes('반려견'))) {
    return 'pet';
  }
  return null;
}

exports.getTags = async () => {
  const { rows } = await pool.query(
    `SELECT tag_id, name, type, group_name
     FROM tags
     WHERE is_active = TRUE
     ORDER BY type ASC, group_name ASC, name ASC`
  );

  // 개별 태그에 api_theme 필드 보강 (방안 B 지원)
  const enrichedRows = rows.map((tag) => ({
    ...tag,
    api_theme: resolveApiTheme(tag.group_name, tag.name),
  }));

  const courseTags = enrichedRows.filter((tag) => tag.type === 'course');
  const spotTags = enrichedRows.filter((tag) => tag.type === 'spot');

  // 그룹별 태그 집계 및 api_theme 메타데이터 객체 생성 (방안 A 지원)
  const groupTags = (tags) => {
    return tags.reduce((acc, tag) => {
      const group = tag.group_name || '기타';
      if (!acc[group]) {
        acc[group] = {
          api_theme: GROUP_API_THEME_MAP[group] || null,
          tags: [],
        };
      }
      acc[group].tags.push(tag);
      return acc;
    }, {});
  };

  return {
    total: enrichedRows.length,
    course_count: courseTags.length,
    spot_count: spotTags.length,
    course_tags: courseTags,
    spot_tags: spotTags,
    course_tags_by_group: groupTags(courseTags),
    spot_tags_by_group: groupTags(spotTags),
  };
};

