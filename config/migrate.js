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

    await client.query(`
      CREATE TABLE IF NOT EXISTS pins (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        description  TEXT,
        latitude     DOUBLE PRECISION NOT NULL,
        longitude    DOUBLE PRECISION NOT NULL,
        address      VARCHAR(255),
        category     VARCHAR(50),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS courses (
        id                SERIAL PRIMARY KEY,
        name              VARCHAR(100) NOT NULL,
        description       TEXT,
        total_distance    DOUBLE PRECISION DEFAULT 0,
        estimated_time    INT DEFAULT 0,
        difficulty        SMALLINT DEFAULT 1,
        status            VARCHAR(20) DEFAULT 'active',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS course_pins (
        id          SERIAL PRIMARY KEY,
        course_id   INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        pin_id      INT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
        order_index INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_course_pin UNIQUE (course_id, pin_id)
      );

      CREATE TABLE IF NOT EXISTS route_segments (
        id           SERIAL PRIMARY KEY,
        course_id    INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        from_pin_id  INT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
        to_pin_id    INT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
        order_index  INT NOT NULL DEFAULT 0,
        coordinates  JSONB NOT NULL DEFAULT '[]',
        distance     DOUBLE PRECISION DEFAULT 0,
        duration     DOUBLE PRECISION DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_route_segment UNIQUE (course_id, from_pin_id, to_pin_id)
      );

      CREATE TABLE IF NOT EXISTS spots (
        id          SERIAL PRIMARY KEY,
        course_id   INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        latitude    DOUBLE PRECISION NOT NULL,
        longitude   DOUBLE PRECISION NOT NULL,
        category    VARCHAR(50),
        order_index INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_course_pins_course_id    ON course_pins(course_id);
      CREATE INDEX IF NOT EXISTS idx_route_segments_course_id ON route_segments(course_id);
      CREATE INDEX IF NOT EXISTS idx_spots_course_id          ON spots(course_id);
    `);

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