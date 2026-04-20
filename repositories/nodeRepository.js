const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Node Repository  (nodes 테이블 - pin / spot 통합)
//  node_type: 'pin' | 'spot'
// ─────────────────────────────────────────────────────────────────────

const NodeRepository = {

  // ── Pin ───────────────────────────────────────────────────────────

  async findAllPins() {
    const { rows } = await pool.query(
      `SELECT * FROM nodes WHERE node_type = 'pin' ORDER BY created_at DESC`
    );
    return rows;
  },

  async findPinById(nodeId) {
    const { rows } = await pool.query(
      `SELECT * FROM nodes WHERE node_id = $1 AND node_type = 'pin'`,
      [nodeId]
    );
    return rows[0] || null;
  },

  async createPin({ latitude, longitude, label, userId }) {
    const { rows } = await pool.query(
      `INSERT INTO nodes (node_type, location, label, user_id)
       VALUES ('pin', ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4)
       RETURNING *`,
      [longitude, latitude, label, userId]
    );
    return rows[0];
  },

  async updatePin(nodeId, { latitude, longitude, label }) {
    const { rows } = await pool.query(
      `UPDATE nodes
       SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326), label = $3
       WHERE node_id = $4 AND node_type = 'pin'
       RETURNING *`,
      [longitude, latitude, label, nodeId]
    );
    return rows[0] || null;
  },

  async deletePin(nodeId) {
    const { rowCount } = await pool.query(
      `DELETE FROM nodes WHERE node_id = $1 AND node_type = 'pin'`,
      [nodeId]
    );
    return rowCount > 0;
  },

  // ── Spot ──────────────────────────────────────────────────────────

  async findAllPins() {
  const { rows } = await pool.query(
    `SELECT *,
       ST_Y(location::geometry) AS latitude,
       ST_X(location::geometry) AS longitude
     FROM nodes 
     WHERE node_type = 'pin' 
     ORDER BY created_at DESC`
  );
  return rows;
},

async findPinById(nodeId) {
  const { rows } = await pool.query(
    `SELECT *,
       ST_Y(location::geometry) AS latitude,
       ST_X(location::geometry) AS longitude
     FROM nodes 
     WHERE node_id = $1 AND node_type = 'pin'`,
    [nodeId]
  );
  return rows[0] || null;
},

  async createSpot({ name, description, latitude, longitude, contentTypes, userId }) {
    const { rows } = await pool.query(
      `INSERT INTO nodes (node_type, location, name, description, content_types, user_id,
                          is_deleted, is_hidden, report_count, updated_at)
       VALUES ('spot', ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6,
               FALSE, FALSE, 0, NOW())
       RETURNING *`,
      [longitude, latitude, name, description, JSON.stringify(contentTypes ?? {}), userId]
    );
    return rows[0];
  },

  async updateSpot(nodeId, { name, description, latitude, longitude, contentTypes }) {
    const { rows } = await pool.query(
      `UPDATE nodes
       SET name=$1, description=$2,
           location=ST_SetSRID(ST_MakePoint($3, $4), 4326),
           content_types=$5
       WHERE node_id=$6 AND node_type='spot' AND is_deleted=FALSE
       RETURNING *`,
      [name, description, longitude, latitude, JSON.stringify(contentTypes ?? {}), nodeId]
    );
    return rows[0] || null;
  },

  // soft delete
  async deleteSpot(nodeId) {
    const { rowCount } = await pool.query(
      `UPDATE nodes SET is_deleted=TRUE WHERE node_id=$1 AND node_type='spot'`,
      [nodeId]
    );
    return rowCount > 0;
  },

  // 반경 내 스팟 조회 (PostGIS)
  async findSpotsWithinRadius(lat, lng, radiusKm) {
  const { rows } = await pool.query(
    `SELECT *,
       ST_Y(location::geometry) AS latitude,
       ST_X(location::geometry) AS longitude,
       ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS distance_km
     FROM nodes
     WHERE node_type = 'spot'
       AND is_deleted = FALSE
       AND ST_DWithin(
         location::geography,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         $3 * 1000
       )
     ORDER BY distance_km ASC`,
    [lat, lng, radiusKm]
  );
  return rows;
},

  // 코스에 연결된 노드(pin/spot) 조회
  async findByCourse(courseId, nodeType = null) {
    const typeFilter = nodeType ? `AND n.node_type = '${nodeType}'` : '';
    const { rows } = await pool.query(
      `SELECT n.*,
         cp.node_order,
         ST_Y(n.location::geometry) AS latitude,
         ST_X(n.location::geometry) AS longitude
       FROM nodes n
       JOIN course_path cp ON cp.node_id = n.node_id
       WHERE cp.course_id = $1 ${typeFilter}
       ORDER BY cp.node_order ASC`,
      [courseId]
    );
    return rows;
  },
};

module.exports = NodeRepository;