const pool = require('../config/db');
const bcrypt = require('bcrypt');

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. 유저 ──────────────────────────────────────
    const passwordHash = await bcrypt.hash('test1234!', 10);

    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, nickname, role)
       VALUES ($1, $2, $3, 'user')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING user_id, email, nickname`,
      ['test@test.com', passwordHash, '테스터']
    );
    console.log('✅ 유저 생성:', user);

    // 관리자 계정 (코스 등록용)
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (email, password_hash, nickname, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING user_id, email, nickname`,
      ['admin@test.com', passwordHash, '관리자']
    );
    console.log('✅ 관리자 생성:', admin);

    // ── 2. 스팟 ──────────────────────────────────────
    const spots = [
      {
        name: '광화문광장',
        lng: 126.9770, lat: 37.5759,
        address: '서울 종로구 세종대로 172',
        categories: ['공원·광장'],
        content_place: '조선시대 육조거리가 있던 자리로, 현재는 서울의 대표적인 광장입니다.',
        content_history: '1395년 경복궁 창건 후 형성된 육조거리로, 조선 행정의 중심지였습니다.',
        content_tour: '세종대왕 동상과 이순신 장군 동상이 있으며, 분수 쇼가 유명합니다.',
      },
      {
        name: '경복궁',
        lng: 126.9770, lat: 37.5796,
        address: '서울 종로구 사직로 161',
        categories: ['공원·광장'],
        content_place: '조선왕조의 법궁으로 1395년에 창건되었습니다.',
        content_history: '태조 이성계가 창건한 조선의 정궁으로, 임진왜란 때 소실 후 고종 때 중건되었습니다.',
        content_tour: '수문장 교대식이 매일 진행되며, 한복 착용 시 무료입장이 가능합니다.',
      },
      {
        name: '청계천',
        lng: 126.9800, lat: 37.5694,
        address: '서울 종로구 청계천로',
        categories: ['강·하천'],
        content_place: '서울 도심을 흐르는 하천으로 복원 후 시민 휴식 공간으로 사랑받고 있습니다.',
        content_history: '조선시대 개천으로 불리다 일제강점기 복개, 2005년 복원되었습니다.',
        content_tour: '청계광장부터 오간수교까지 약 5.8km 산책로가 조성되어 있습니다.',
      },
    ];

    const spotIds = [];
    for (const s of spots) {
      const { rows: [spot] } = await client.query(
        `INSERT INTO spots (name, location, address, categories, content_place, content_history, content_tour, source)
         VALUES ($1, ST_Point($2, $3)::geography, $4, $5, $6, $7, $8, 'admin')
         ON CONFLICT DO NOTHING
         RETURNING spot_id, name`,
        [s.name, s.lng, s.lat, s.address, s.categories, s.content_place, s.content_history, s.content_tour]
      );
      if (spot) {
        spotIds.push({ id: spot.spot_id, name: spot.name, lng: s.lng, lat: s.lat });
        console.log('✅ 스팟 생성:', spot);
      }
    }

    // ── 3. 코스 ──────────────────────────────────────
    const { rows: [course] } = await client.query(
      `INSERT INTO courses (owner_id, name, description, category, route_geometry, total_distance, estimated_duration, is_public)
       VALUES (
         $1, $2, $3, $4,
         ST_GeomFromText('LINESTRING(126.9770 37.5759, 126.9770 37.5796, 126.9800 37.5694)', 4326)::geography,
         3500, 50, true
       )
       RETURNING course_id, name`,
      [admin.user_id, '광화문-경복궁-청계천 코스', '서울 도심의 역사를 느끼며 걷는 코스', '도심길']
    );
    console.log('✅ 코스 생성:', course);

    // ── 4. 코스 경유지 ──────────────────────────────
    if (spotIds.length === 3) {
      for (let i = 0; i < spotIds.length; i++) {
        await client.query(
          `INSERT INTO course_waypoints (course_id, seq, type, spot_id)
           VALUES ($1, $2, 'spot', $3)`,
          [course.course_id, i + 1, spotIds[i].id]
        );
      }
      console.log('✅ 경유지 생성 완료');
    }

    await client.query('COMMIT');
    console.log('\n🎉 시드 완료!');
    console.log('📧 테스트 계정: test@test.com / test1234!');
    console.log('📧 관리자 계정: admin@test.com / test1234!');
    console.log('🗺️  코스 ID:', course.course_id);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 시드 실패:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();