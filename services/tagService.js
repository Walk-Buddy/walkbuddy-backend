const pool = require('../config/db');

exports.getTags = async () => {
  const { rows } = await pool.query(
    `SELECT tag_id, name, type, group_name
     FROM tags
     WHERE is_active = TRUE
     ORDER BY type ASC, group_name ASC, name ASC`
  );

  const courseTags = rows.filter((tag) => tag.type === 'course');
  const spotTags = rows.filter((tag) => tag.type === 'spot');

  const groupTags = (tags) => {
    return tags.reduce((acc, tag) => {
      const group = tag.group_name || '기타';
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(tag);
      return acc;
    }, {});
  };

  return {
    total: rows.length,
    course_count: courseTags.length,
    spot_count: spotTags.length,
    course_tags: courseTags,
    spot_tags: spotTags,
    course_tags_by_group: groupTags(courseTags),
    spot_tags_by_group: groupTags(spotTags),
  };
};

