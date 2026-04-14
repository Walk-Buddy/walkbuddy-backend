require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const pinRoutes = require('./routes/pins');
const courseRoutes = require('./routes/courses');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health Check ────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/pins', pinRoutes);
app.use('/api/courses', courseRoutes);

// ── 404 ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📋 API 목록:`);
  console.log(`   GET    /health`);
  console.log(`   --- Pins ---`);
  console.log(`   GET    /api/pins`);
  console.log(`   POST   /api/pins`);
  console.log(`   GET    /api/pins/:id`);
  console.log(`   PUT    /api/pins/:id`);
  console.log(`   DELETE /api/pins/:id`);
  console.log(`   --- Courses ---`);
  console.log(`   GET    /api/courses`);
  console.log(`   POST   /api/courses`);
  console.log(`   GET    /api/courses/:id`);
  console.log(`   PUT    /api/courses/:id`);
  console.log(`   DELETE /api/courses/:id`);
  console.log(`   POST   /api/courses/:id/pins`);
  console.log(`   DELETE /api/courses/:id/pins/:pinId`);
  console.log(`   --- Route (Day 2) ---`);
  console.log(`   POST   /api/courses/:id/route/build`);
  console.log(`   GET    /api/courses/:id/route/coordinates`);
  console.log(`   POST   /api/courses/:id/route/connect-pins`);
});

module.exports = app;