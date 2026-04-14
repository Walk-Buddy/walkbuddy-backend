require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { swaggerUi, specs } = require('./config/swagger');

const pinRoutes          = require('./routes/pins');
const courseCreateRoutes = require('./routes/courseCreate');
const courseListRoutes   = require('./routes/courseList');
const courseDetailRoutes = require('./routes/courseDetail');
const courseRoutes       = require('./routes/courses');
const bookmarkRoutes     = require('./routes/bookmark');
const bookmarkListRoutes = require('./routes/bookmarkList');
const tagRoutes          = require('./routes/tags');
const spotRoutes       = require('./routes/spots');
const routeRoutes      = require('./routes/routes');
const walkRoutes       = require('./routes/walks');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Swagger ─────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

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
app.use('/api/pins',    pinRoutes);
app.use('/api/courses', courseCreateRoutes);  // POST /                  (코스 등록)
app.use('/api/courses', courseListRoutes);    // GET /                   (목록 조회)
app.use('/api/courses', courseDetailRoutes); // GET /:courseId           (상세 조회)
app.use('/api/courses', bookmarkRoutes);     // POST /:courseId/bookmark (북마크 토글)
app.use('/api/courses', courseRoutes);       // 나머지 CRUD
app.use('/api/bookmarks', bookmarkListRoutes); // GET / (내 북마크 목록)
app.use('/api/tags',      tagRoutes);          // GET / (태그 목록)
app.use('/api/spots',   spotRoutes);
app.use('/api/routes',  routeRoutes);
app.use('/api/walks',   walkRoutes);

// ── 404 ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📋 Swagger UI: http://localhost:${PORT}/api-docs`);
  console.log(`   --- Pins ---`);
  console.log(`   GET/POST       /api/pins`);
  console.log(`   GET/PUT/DELETE /api/pins/:nodeId`);
  console.log(`   --- Spots ---`);
  console.log(`   GET            /api/spots/pins`);
  console.log(`   POST           /api/spots`);
  console.log(`   GET/PUT/DELETE /api/spots/:spotId`);
  console.log(`   --- Courses ---`);
  console.log(`   GET            /api/courses`);
  console.log(`   POST           /api/courses/manual`);
  console.log(`   GET/PUT/DELETE /api/courses/:courseId`);
  console.log(`   POST           /api/courses/:courseId/pins`);
  console.log(`   DELETE         /api/courses/:courseId/pins/:nodeId`);
  console.log(`   --- Routes ---`);
  console.log(`   POST           /api/routes/calculate`);
  console.log(`   POST           /api/routes/detect-spots`);
  console.log(`   --- Walks (GPS 기록) ---`);
  console.log(`   POST           /api/walks/tracking/start`);
  console.log(`   POST           /api/walks/tracking/:id/loc`);
  console.log(`   POST           /api/walks/tracking/:id/spots`);
  console.log(`   POST           /api/walks/tracking/:id/stop`);
});

module.exports = app;