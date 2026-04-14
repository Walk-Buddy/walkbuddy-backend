require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const pinRoutes = require('./routes/pins');
const courseRoutes = require('./routes/courses');
const spotRoutes = require('./routes/spots');
const recordingRoutes = require('./routes/recordings');

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
app.use('/api/spots', spotRoutes);
app.use('/api/courses/:courseId/spots', spotRoutes);
app.use('/api/recordings', recordingRoutes);

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
  console.log(`   GET    /api/pins/:nodeId`);
  console.log(`   PUT    /api/pins/:nodeId`);
  console.log(`   DELETE /api/pins/:nodeId`);
  console.log(`   --- Courses ---`);
  console.log(`   GET    /api/courses`);
  console.log(`   POST   /api/courses`);
  console.log(`   GET    /api/courses/:courseId`);
  console.log(`   PUT    /api/courses/:courseId`);
  console.log(`   DELETE /api/courses/:courseId`);
  console.log(`   POST   /api/courses/:courseId/pins`);
  console.log(`   DELETE /api/courses/:courseId/pins/:nodeId`);
  console.log(`   --- Route (Day 2-3) ---`);
  console.log(`   POST   /api/courses/:courseId/route/build`);
  console.log(`   GET    /api/courses/:courseId/route/coordinates`);
  console.log(`   POST   /api/courses/:courseId/route/connect-pins`);
  console.log(`   --- Spots (Day 4) ---`);
  console.log(`   GET    /api/spots`);
  console.log(`   POST   /api/spots`);
  console.log(`   GET    /api/spots/:nodeId`);
  console.log(`   PUT    /api/spots/:nodeId`);
  console.log(`   DELETE /api/spots/:nodeId`);
  console.log(`   GET    /api/courses/:courseId/spots`);
  console.log(`   --- Recordings (Day 5-6) ---`);
  console.log(`   POST   /api/recordings/start`);
  console.log(`   POST   /api/recordings/:id/stop`);
  console.log(`   POST   /api/recordings/:id/pause`);
  console.log(`   POST   /api/recordings/:id/resume`);
  console.log(`   POST   /api/recordings/:id/coordinates`);
  console.log(`   POST   /api/recordings/:id/spots`);
  console.log(`   POST   /api/recordings/:id/save-as-course`);
});

module.exports = app;