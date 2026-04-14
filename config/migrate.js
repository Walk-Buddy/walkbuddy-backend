require('dotenv').config();
const pool = require('./db');

// ─────────────────────────────────────────────────────────────────────
//  Migration
//  실행: npm run migrate
//
//  필요한 테이블 목록 (아래 구조 참고해서 작성해주세요):
//
//  [pins]
//    id, name, description, latitude, longitude, address, category,
//    created_at, updated_at
//
//  [courses]
//    id, name, description, total_distance, estimated_time,
//    difficulty, status, created_at, updated_at
//
//  [course_pins]
//    id, course_id → courses(id), pin_id → pins(id),
//    order_index, created_at
//    UNIQUE: (course_id, pin_id)
//
//  [route_segments]
//    id, course_id → courses(id), from_pin_id → pins(id),
//    to_pin_id → pins(id), order_index,
//    coordinates JSONB DEFAULT '[]',
//    distance, duration, created_at, updated_at
//    UNIQUE: (course_id, from_pin_id, to_pin_id)  ← upsert 필수
//
//  [spots]
//    id, course_id → courses(id), name, description,
//    latitude, longitude, category, order_index,
//    created_at, updated_at
//
//  [indexes]
//    idx_course_pins_course_id      ON course_pins(course_id)
//    idx_route_segments_course_id   ON route_segments(course_id)
//    idx_spots_course_id            ON spots(course_id)
// ─────────────────────────────────────────────────────────────────────

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // TODO: 테이블 생성 쿼리 작성

    await client.query('COMMIT');
    console.log('✅ Migration 완료');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 실패:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();