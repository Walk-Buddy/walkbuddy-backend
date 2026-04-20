require('dotenv').config();
const pool = require('./config/db');

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT node_id,
        ST_Y(location::geometry) AS latitude,
        ST_X(location::geometry) AS longitude
      FROM nodes
      WHERE node_id IN (
        '075c568e-9a50-4a12-a3b4-b5eb9fd80cb5',
        'a3b63048-e720-4fa8-a400-89b7c72aa4e7'
      )
    `);
    console.log(rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run();