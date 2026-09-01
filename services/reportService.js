const pool = require('../config/db');

// ──────────────────────────────────────────────────────────────────────
// 상수 정의 (허용값 목록)
// ──────────────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = ['environment', 'user'];
const ALLOWED_TARGET_TYPES = ['course', 'spot', 'course_review', 'spot_review', 'user', 'location'];
const ALLOWED_REASONS = [
  'construction', 'blocked', 'dangerous', 'info_error',
  'spam', 'abuse', 'inappropriate', 'false_info', 'portrait', 'etc'
];
const ALLOWED_STATUSES = ['in_progress', 'completed', 'rejected'];
const ALLOWED_ACTIONS = ['none', 'hide_target', 'suspend_user'];

// UUID 정규식 검증 헬퍼
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

// ──────────────────────────────────────────────────────────────────────
// 1. 신고 접수 (일반 사용자)
// ──────────────────────────────────────────────────────────────────────
exports.createReport = async (userId, data) => {
  const {
    target_type,
    target_id,
    latitude,
    longitude,
    report_category,
    reason,
    memo,
    photo_url
  } = data;

  // 1-1. 기본 필수값 및 enum 검증
  if (!target_type || !ALLOWED_TARGET_TYPES.includes(target_type)) {
    const err = new Error(`유효하지 않은 target_type입니다. 허용값: ${ALLOWED_TARGET_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!report_category || !ALLOWED_CATEGORIES.includes(report_category)) {
    const err = new Error(`유효하지 않은 report_category입니다. 허용값: ${ALLOWED_CATEGORIES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!reason || !ALLOWED_REASONS.includes(reason)) {
    const err = new Error(`유효하지 않은 reason입니다. 허용값: ${ALLOWED_REASONS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // 1-2. 위치 기반 신고(location) 처리
  if (target_type === 'location') {
    if (target_id) {
      const err = new Error('위치 기반 신고(location)에는 target_id를 함께 지정할 수 없습니다.');
      err.status = 400;
      throw err;
    }
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      const err = new Error('위치 기반 신고(location)에는 latitude와 longitude가 필수입니다.');
      err.status = 400;
      throw err;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      const err = new Error('유효하지 않은 위도/경도 좌표 범위입니다.');
      err.status = 400;
      throw err;
    }

    const { rows: [report] } = await pool.query(
      `INSERT INTO reports (
        reporter_id, target_type, report_category, reason, memo, photo_url, location, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, 'received'
      )
      RETURNING
        report_id, reporter_id, target_type, target_id, report_category, reason, memo, photo_url,
        status, created_at`,
      [userId, target_type, report_category, reason, memo || null, photo_url || null, lng, lat]
    );

    return report;
  }

  // 1-3. ID 기반 신고 (course, spot, course_review, spot_review, user)
  if (!target_id || !isValidUUID(target_id)) {
    const err = new Error('유효한 UUID 형식의 target_id가 필요합니다.');
    err.status = 400;
    throw err;
  }

  if (latitude !== undefined || longitude !== undefined) {
    const err = new Error('ID 기반 신고에는 latitude/longitude 좌표를 지정할 수 없습니다.');
    err.status = 400;
    throw err;
  }

  // 1-4. 다형성 참조 대상 실존 여부 검증 (Polymorphic Target Validation)
  let targetExists = false;
  switch (target_type) {
    case 'course': {
      const { rows } = await pool.query('SELECT course_id FROM courses WHERE course_id = $1', [target_id]);
      targetExists = rows.length > 0;
      break;
    }
    case 'spot': {
      const { rows } = await pool.query('SELECT spot_id FROM spots WHERE spot_id = $1', [target_id]);
      targetExists = rows.length > 0;
      break;
    }
    case 'course_review': {
      const { rows } = await pool.query('SELECT course_review_id FROM course_reviews WHERE course_review_id = $1', [target_id]);
      targetExists = rows.length > 0;
      break;
    }
    case 'spot_review': {
      const { rows } = await pool.query('SELECT spot_review_id FROM spot_reviews WHERE spot_review_id = $1', [target_id]);
      targetExists = rows.length > 0;
      break;
    }
    case 'user': {
      const { rows } = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [target_id]);
      targetExists = rows.length > 0;
      break;
    }
  }

  if (!targetExists) {
    const err = new Error(`신고 대상(${target_type})이 존재하지 않습니다.`);
    err.status = 404;
    throw err;
  }

  // 1-5. 중복 신고 검증 (동일 사용자가 동일 대상을 중복 신고 방지)
  const { rows: existing } = await pool.query(
    'SELECT report_id FROM reports WHERE reporter_id = $1 AND target_id = $2 AND target_type = $3',
    [userId, target_id, target_type]
  );
  if (existing.length > 0) {
    const err = new Error('이미 접수된 신고 내역이 있습니다.');
    err.status = 409;
    throw err;
  }

  // 1-6. DB INSERT
  const { rows: [report] } = await pool.query(
    `INSERT INTO reports (
      reporter_id, target_type, target_id, report_category, reason, memo, photo_url, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'received'
    )
    RETURNING
      report_id, reporter_id, target_type, target_id, report_category, reason, memo, photo_url,
      status, created_at`,
    [userId, target_type, target_id, report_category, reason, memo || null, photo_url || null]
  );

  return report;
};

// ──────────────────────────────────────────────────────────────────────
// 2. 내 신고 목록 조회 (일반 사용자)
// ──────────────────────────────────────────────────────────────────────
exports.getMyReports = async (userId, query) => {
  const { status, page = 1, limit = 20 } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['reporter_id = $1'];
  const params = [userId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT COUNT(*) AS total FROM reports WHERE ${whereClause}`;
  const { rows: [{ total }] } = await pool.query(countQuery, params);

  const listParams = [...params, limitNum, offset];
  const listQuery = `
    SELECT
      report_id,
      target_type,
      target_id,
      report_category,
      reason,
      memo,
      photo_url,
      CASE
        WHEN location IS NOT NULL THEN json_build_object(
          'latitude', ST_Y(location::geometry),
          'longitude', ST_X(location::geometry)
        )
        ELSE NULL
      END AS location,
      status,
      created_at
    FROM reports
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;
  const { rows: reports } = await pool.query(listQuery, listParams);

  return {
    total: parseInt(total, 10),
    page: pageNum,
    limit: limitNum,
    reports
  };
};

// ──────────────────────────────────────────────────────────────────────
// 3. 관리자 신고 목록 조회
// ──────────────────────────────────────────────────────────────────────
exports.getAdminReports = async (query) => {
  const { status, report_category, target_type, page = 1, limit = 20 } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (report_category) {
    params.push(report_category);
    conditions.push(`r.report_category = $${params.length}`);
  }
  if (target_type) {
    params.push(target_type);
    conditions.push(`r.target_type = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) AS total FROM reports r ${whereClause}`;
  const { rows: [{ total }] } = await pool.query(countQuery, params);

  const listParams = [...params, limitNum, offset];
  const listQuery = `
    SELECT
      r.report_id,
      r.reporter_id,
      u.nickname AS reporter_nickname,
      r.target_type,
      r.target_id,
      r.report_category,
      r.reason,
      r.memo,
      CASE
        WHEN r.location IS NOT NULL THEN json_build_object(
          'latitude', ST_Y(r.location::geometry),
          'longitude', ST_X(r.location::geometry)
        )
        ELSE NULL
      END AS location,
      r.photo_url,
      r.status,
      r.created_at,
      r.updated_at
    FROM reports r
    LEFT JOIN users u ON u.user_id = r.reporter_id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;
  const { rows: reports } = await pool.query(listQuery, listParams);

  return {
    total: parseInt(total, 10),
    page: pageNum,
    limit: limitNum,
    reports
  };
};

// ──────────────────────────────────────────────────────────────────────
// 4. 관리자 신고 상세 조회 (신고 내용 + 대상 상세 정보 포함)
// ──────────────────────────────────────────────────────────────────────
exports.getAdminReportById = async (reportId) => {
  if (!isValidUUID(reportId)) {
    const err = new Error('유효한 UUID 형식의 report_id가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const { rows: [report] } = await pool.query(
    `SELECT
      r.report_id,
      r.target_type,
      r.target_id,
      r.report_category,
      r.reason,
      r.memo,
      CASE
        WHEN r.location IS NOT NULL THEN json_build_object(
          'latitude', ST_Y(r.location::geometry),
          'longitude', ST_X(r.location::geometry)
        )
        ELSE NULL
      END AS location,
      r.photo_url,
      r.status,
      r.created_at,
      r.updated_at,
      json_build_object(
        'user_id', u.user_id,
        'nickname', u.nickname,
        'email', u.email
      ) AS reporter
    FROM reports r
    LEFT JOIN users u ON u.user_id = r.reporter_id
    WHERE r.report_id = $1`,
    [reportId]
  );

  if (!report) {
    const err = new Error('신고 내역을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  // 대상 원본 상세 정보 조회 (target_details)
  let targetDetails = null;
  if (report.target_id) {
    switch (report.target_type) {
      case 'course': {
        const { rows: [course] } = await pool.query(
          'SELECT course_id, name, description, status, owner_id FROM courses WHERE course_id = $1',
          [report.target_id]
        );
        targetDetails = course || { status: 'deleted_or_not_found' };
        break;
      }
      case 'spot': {
        const { rows: [spot] } = await pool.query(
          'SELECT spot_id, name, address, status FROM spots WHERE spot_id = $1',
          [report.target_id]
        );
        targetDetails = spot || { status: 'deleted_or_not_found' };
        break;
      }
      case 'course_review': {
        const { rows: [review] } = await pool.query(
          `SELECT cr.course_review_id, cr.course_id, cr.description, cr.rating, cr.status, cr.user_id, u.nickname
           FROM course_reviews cr
           LEFT JOIN users u ON u.user_id = cr.user_id
           WHERE cr.course_review_id = $1`,
          [report.target_id]
        );
        targetDetails = review || { status: 'deleted_or_not_found' };
        break;
      }
      case 'spot_review': {
        const { rows: [review] } = await pool.query(
          `SELECT sr.spot_review_id, sr.spot_id, sr.description, sr.status, sr.user_id, u.nickname
           FROM spot_reviews sr
           LEFT JOIN users u ON u.user_id = sr.user_id
           WHERE sr.spot_review_id = $1`,
          [report.target_id]
        );
        targetDetails = review || { status: 'deleted_or_not_found' };
        break;
      }
      case 'user': {
        const { rows: [user] } = await pool.query(
          'SELECT user_id, nickname, email, status, role FROM users WHERE user_id = $1',
          [report.target_id]
        );
        targetDetails = user || { status: 'deleted_or_not_found' };
        break;
      }
    }
  }

  return {
    ...report,
    target_details: targetDetails
  };
};

// ──────────────────────────────────────────────────────────────────────
// 5. 관리자 신고 처리 (상태 변경, 대상 제재 조치, 알림 발송 트랜잭션)
// ──────────────────────────────────────────────────────────────────────
exports.updateReportStatus = async (adminId, reportId, data) => {
  if (!isValidUUID(reportId)) {
    const err = new Error('유효한 UUID 형식의 report_id가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const { status, action = 'none', notify = true } = data;

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    const err = new Error(`유효하지 않은 status입니다. 허용값: ${ALLOWED_STATUSES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (action && !ALLOWED_ACTIONS.includes(action)) {
    const err = new Error(`유효하지 않은 action입니다. 허용값: ${ALLOWED_ACTIONS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 5-1. 신고 레코드 행 잠금(FOR UPDATE) 조회
    const { rows: [report] } = await client.query(
      'SELECT * FROM reports WHERE report_id = $1 FOR UPDATE',
      [reportId]
    );

    if (!report) {
      const err = new Error('신고 내역을 찾을 수 없습니다.');
      err.status = 404;
      throw err;
    }

    // 5-2. 신고 상태 업데이트
    const { rows: [updatedReport] } = await client.query(
      `UPDATE reports
       SET status = $1, updated_at = NOW()
       WHERE report_id = $2
       RETURNING report_id, status, updated_at, reporter_id, target_type, target_id`,
      [status, reportId]
    );

    // 5-3. 대상 콘텐츠/유저 제재 조치 (action)
    let actionApplied = 'none';
    if (action === 'hide_target' && report.target_id) {
      switch (report.target_type) {
        case 'course':
          await client.query("UPDATE courses SET status = 'hidden', updated_at = NOW() WHERE course_id = $1", [report.target_id]);
          actionApplied = 'course_hidden';
          break;
        case 'spot':
          await client.query("UPDATE spots SET status = 'hidden', updated_at = NOW() WHERE spot_id = $1", [report.target_id]);
          actionApplied = 'spot_hidden';
          break;
        case 'course_review':
          await client.query("UPDATE course_reviews SET status = 'hidden', updated_at = NOW() WHERE course_review_id = $1", [report.target_id]);
          actionApplied = 'course_review_hidden';
          break;
        case 'spot_review':
          await client.query("UPDATE spot_reviews SET status = 'hidden', updated_at = NOW() WHERE spot_review_id = $1", [report.target_id]);
          actionApplied = 'spot_review_hidden';
          break;
        case 'user':
          await client.query("UPDATE users SET status = 'suspended', updated_at = NOW() WHERE user_id = $1", [report.target_id]);
          actionApplied = 'user_suspended';
          break;
      }
    } else if (action === 'suspend_user') {
      let targetUserId = null;
      if (report.target_type === 'user') {
        targetUserId = report.target_id;
      } else if (report.target_type === 'course') {
        const { rows: [c] } = await client.query('SELECT owner_id FROM courses WHERE course_id = $1', [report.target_id]);
        if (c) targetUserId = c.owner_id;
      } else if (report.target_type === 'course_review') {
        const { rows: [cr] } = await client.query('SELECT user_id FROM course_reviews WHERE course_review_id = $1', [report.target_id]);
        if (cr) targetUserId = cr.user_id;
      } else if (report.target_type === 'spot_review') {
        const { rows: [sr] } = await client.query('SELECT user_id FROM spot_reviews WHERE spot_review_id = $1', [report.target_id]);
        if (sr) targetUserId = sr.user_id;
      }

      if (targetUserId) {
        await client.query("UPDATE users SET status = 'suspended', updated_at = NOW() WHERE user_id = $1", [targetUserId]);
        actionApplied = 'user_suspended';
      }
    }

    // 5-4. 신고자에게 알림 생성 (notifications 테이블)
    let notificationCreated = false;
    if (notify && report.reporter_id) {
      let notificationMessage = '';
      if (status === 'completed') {
        notificationMessage = '접수하신 신고 내용이 확인되어 처리가 완료되었습니다.';
      } else if (status === 'rejected') {
        notificationMessage = '접수하신 신고 내용 검토 결과 이상이 없어 반려되었습니다.';
      } else if (status === 'in_progress') {
        notificationMessage = '접수하신 신고 내용이 현재 담당자 확인 및 처리 중입니다.';
      }

      if (notificationMessage) {
        await client.query(
          `INSERT INTO notifications (user_id, target_id, target_type, message)
           VALUES ($1, $2, 'report', $3)`,
          [report.reporter_id, reportId, notificationMessage]
        );
        notificationCreated = true;
      }
    }

    await client.query('COMMIT');

    return {
      report_id: updatedReport.report_id,
      status: updatedReport.status,
      action_applied: actionApplied,
      notification_created: notificationCreated,
      updated_at: updatedReport.updated_at
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
