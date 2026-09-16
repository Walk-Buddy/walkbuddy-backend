const pool = require('../config/db');

exports.getTags = async () => {
  const { rows } = await pool.query(
    `SELECT tag_id, name, type
     FROM tags
     WHERE is_active = TRUE
     ORDER BY type ASC, name ASC`
  );

  const courseTags = rows.filter((tag) => tag.type === 'course');
  const spotTags = rows.filter((tag) => tag.type === 'spot');

  return {
    total: rows.length,
    course_count: courseTags.length,
    spot_count: spotTags.length,
    course_tags: courseTags,
    spot_tags: spotTags,
  };
};
