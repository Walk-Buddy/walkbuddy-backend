/**
 * scripts/backfill-course-tags.js
 *
 * 기존에 이미 적재된 코스들에 대해 코스 태그를 "일괄 재도출·부착"한다.
 *
 * 동작:
 *   - status='active' 인 모든 코스 순회
 *   - courseTagService.autoTagCourse() 로
 *       (1) 카테고리 기반 태그
 *       (2) 설명(summary/content/traveler_info) 키워드 기반 태그
 *       (3) 경유지 스팟 태그 승격 태그
 *     를 도출해 taggings 에 부착 (기존 태그는 유지, 중복만 무시)
 *
 * 실행:
 *   node scripts/backfill-course-tags.js
 *   node scripts/backfill-course-tags.js --limit=50
 *
 * 참고: importer 재실행 없이 기존 데이터에 즉시 태그를 채우기 위한 1회성 스크립트.
 *       여러 번 돌려도 ON CONFLICT DO NOTHING 이라 안전(idempotent).
 */

require('dotenv').config();

const pool = require('../config/db');
const courseTagService = require('../services/courseTagService');
const { parseDescriptionSections } = require('../utils/courseDescription');

const args = process.argv.slice(2);
const limitArg = Number.parseInt(
  (args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '0',
  10
);

async function main() {
  const client = await pool.connect();
  const summary = { scanned: 0, tagged: 0, tags_added: 0, failed: 0 };

  try {
    const { rows: courses } = await client.query(
      `SELECT course_id, name, category, description
       FROM courses
       WHERE status = 'active'
       ORDER BY created_at DESC
       ${limitArg > 0 ? 'LIMIT $1' : ''}`,
      limitArg > 0 ? [limitArg] : []
    );

    console.log(`🏷️  코스 태그 백필 시작: 대상 ${courses.length}개 코스`);

    for (const course of courses) {
      summary.scanned += 1;
      try {
        const sections = parseDescriptionSections(course.description);
        const attached = await courseTagService.autoTagCourse({
          courseId: course.course_id,
          category: course.category,
          description: course.description,
          sections,
        }, client);

        if (attached.length > 0) {
          summary.tagged += 1;
          summary.tags_added += attached.length;
          console.log(`  ✅ ${course.name}: ${attached.join(', ')}`);
        }
      } catch (err) {
        summary.failed += 1;
        console.warn(`  ⚠️  ${course.name} 태깅 실패: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n코스 태그 백필 결과');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`코스 태그 백필 중단: ${err.message}`);
  process.exit(1);
});
