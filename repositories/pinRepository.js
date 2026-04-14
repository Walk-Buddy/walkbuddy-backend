const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────
//  Pin Repository  (Day 1: DB 기반 Entity/Repository 구현)
// ─────────────────────────────────────────────────────────────────────

const PinRepository = {

  async findAll() {
    const { rows } = await pool.query(
      `SELECT * FROM pins ORDER BY created_at DESC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM pins WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, description, latitude, longitude, address, category }) {
    const { rows } = await pool.query(
      `INSERT INTO pins (name, description, latitude, longitude, address, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, latitude, longitude, address, category]
    );
    return rows[0];
  },

  async update(id, { name, description, latitude, longitude, address, category }) {
    const { rows } = await pool.query(
      `UPDATE pins
       SET name=$1, description=$2, latitude=$3, longitude=$4,
           address=$5, category=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [name, description, latitude, longitude, address, category, id]
    );
    return rows[0] || null;
  },

  async delete(id) {
    const { rowCount } = await pool.query(
      `DELETE FROM pins WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  },

  // 반경 내 핀 조회 (Haversine 근사 - Day 4 스팟 감지에서도 활용)
  async findWithinRadius(lat, lng, radiusKm) {
    const { rows } = await pool.query(
      `SELECT *,
         (6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) *
           cos(radians(longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(latitude))
         )) AS distance_km
       FROM pins
       WHERE (6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) *
           cos(radians(longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(latitude))
         )) < $3
       ORDER BY distance_km ASC`,
      [lat, lng, radiusKm]
    );
    return rows;
  },
};

module.exports = PinRepository;