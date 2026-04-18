/**
 * 문화체육관광부 걷기여행길(KC_CFR_WLK_STRET_INFO_2021) CSV → courses + nodes(pin/spot) + course_path
 * 실행: npm run seed:korea-walk
 *
 * 데이터 파일: data/korea_walk_courses_2021.csv
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { v5: uuidv5 } = require('uuid');
const pool = require('./db');

const WALK_TAG = '__KC_WALK_2021__';
const CSV_REL = path.join('data', 'korea_walk_courses_2021.csv');
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID v5 namespace (DNS)

function id(kind, esntlId) {
  return uuidv5(`${kind}:${esntlId}`, NS);
}

function truncate(str, max) {
  if (!str) return '';
  const t = String(str).trim();
  return t.length <= max ? t : t.slice(0, max);
}

function mapDifficulty(levelNm) {
  if (!levelNm) return 2;
  const s = String(levelNm).trim();
  if (s.includes('어려움')) return 3;
  if (s.includes('매우쉬움') || s === '쉬움') return 1;
  return 2;
}

function parseKm(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number.parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseMinutes(timeStr) {
  if (!timeStr || !String(timeStr).trim()) return 0;
  const s = String(timeStr).replace(/\s+/g, '').replace(/^약/, '');
  let min = 0;
  const h = s.match(/(\d+)시간/);
  if (h) min += parseInt(h[1], 10) * 60;
  const m = s.match(/(\d+)분/);
  if (m) min += parseInt(m[1], 10);
  return min;
}

function buildTitle(flag, nm) {
  const f = (flag || '').trim();
  const n = (nm || '').trim();
  if (!n && !f) return '이름 없음';
  if (!f || f === n) return truncate(n, 100);
  const combined = `${f} — ${n}`;
  return truncate(combined, 100);
}

function buildDescription(row) {
  const lines = [
    `${WALK_TAG}`,
    `출처: 문화체육관광부 걷기여행길 정보 (KC_CFR_WLK_STRET_INFO_2021)`,
    `지역: ${row.SIGNGU_NM || ''}`,
    `길이 구분: ${row.COURS_LT_CN || ''}`,
    '',
    `코스 요약: ${row.COURS_DC || ''}`,
    '',
    `상세: ${row.ADIT_DC || ''}`,
    '',
    `소요(안내): ${row.COURS_TIME_CN || ''}`,
    `편의·화장실: ${row.OPTN_DC || ''} / ${row.TOILET_DC || ''}`,
    `주소: ${row.LNM_ADDR || ''}`,
  ];
  return lines.join('\n');
}

function spotContentTypes(row) {
  return {
    source: 'KC_CFR_WLK_STRET_INFO_2021',
    esntl_id: row.ESNTL_ID,
    theme: row.WLK_COURS_FLAG_NM || null,
    region: row.SIGNGU_NM || null,
    course_level: row.COURS_LEVEL_NM || null,
  };
}

async function removePrevious(client) {
  const { rows } = await client.query(
    `SELECT course_id FROM courses
     WHERE user_id IS NULL
       AND creation_type = 'auto'
       AND description LIKE $1`,
    [`${WALK_TAG}%`]
  );
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.course_id);
  const { rows: nodeRows } = await client.query(
    `SELECT DISTINCT node_id FROM course_path WHERE course_id = ANY($1::uuid[])`,
    [ids]
  );
  const nodeIds = nodeRows.map((r) => r.node_id);

  await client.query(`DELETE FROM courses WHERE course_id = ANY($1::uuid[])`, [ids]);
  if (nodeIds.length) {
    await client.query(`DELETE FROM nodes WHERE node_id = ANY($1::uuid[])`, [nodeIds]);
  }
}

async function importRows() {
  const csvPath = path.join(__dirname, '..', CSV_REL);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV 없음: ${csvPath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(csvPath);
  const records = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const client = await pool.connect();
  let ok = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');
    await removePrevious(client);

    for (const row of records) {
      const esntl = (row.ESNTL_ID || '').trim();
      if (!esntl) {
        skipped += 1;
        continue;
      }

      const lat = Number.parseFloat(String(row.COURS_SPOT_LA).replace(/,/g, ''));
      const lng = Number.parseFloat(String(row.COURS_SPOT_LO).replace(/,/g, ''));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        skipped += 1;
        continue;
      }

      const courseId = id('course', esntl);
      const pinId = id('pin', esntl);
      const spotId = id('spot', esntl);

      const title = buildTitle(row.WLK_COURS_FLAG_NM, row.WLK_COURS_NM);
      const description = buildDescription(row);
      const dist = parseKm(row.COURS_DETAIL_LT_CN);
      const minutes = parseMinutes(row.COURS_TIME_CN);
      const diff = mapDifficulty(row.COURS_LEVEL_NM);

      const pinLabel = truncate(row.WLK_COURS_NM || row.LNM_ADDR || '시점', 50);
      const spotName = truncate(row.WLK_COURS_NM || title, 100);
      const spotDesc = truncate(
        [row.ADIT_DC, row.COURS_DC].filter(Boolean).join('\n\n'),
        5000
      );

      await client.query(
        `INSERT INTO courses (
           course_id, user_id, title, description, creation_type,
           total_distance_km, estimated_minutes, difficulty, visibility
         ) VALUES ($1, NULL, $2, $3, 'auto', $4, $5, $6, 'public')`,
        [courseId, title, description, dist, minutes || 0, diff]
      );

      await client.query(
        `INSERT INTO nodes (node_id, node_type, location, label, user_id)
         VALUES ($1, 'pin', ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, NULL)`,
        [pinId, lng, lat, pinLabel]
      );

      await client.query(
        `INSERT INTO nodes (
           node_id, node_type, location, name, description, content_types,
           is_deleted, is_hidden, report_count, user_id, updated_at
         ) VALUES (
           $1, 'spot', ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6::jsonb,
           FALSE, FALSE, 0, NULL, NOW()
         )`,
        [spotId, lng, lat, spotName, spotDesc || null, JSON.stringify(spotContentTypes(row))]
      );

      await client.query(
        `INSERT INTO course_path (course_id, node_id, node_order) VALUES
         ($1, $2, 1),
         ($1, $3, 2)`,
        [courseId, pinId, spotId]
      );

      ok += 1;
    }

    await client.query('COMMIT');
    console.log(`✅ 걷기길 데이터 적재 완료: ${ok}건 (건너뜀 ${skipped})`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ 적재 실패:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

importRows();
