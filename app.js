require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const swaggerUi    = require('swagger-ui-express');
const swaggerSpec  = require('./config/swagger');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Swagger ──────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Health Check ─────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Routes ───────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
// const userRoutes         = require('./routes/users');
// const tagRoutes          = require('./routes/tags');
const courseRoutes       = require('./routes/courses');
const spotRoutes         = require('./routes/spots');
const walkRoutes         = require('./routes/walks');

const reviewRoutes       = require('./routes/reviews');
const reactionRoutes     = require('./routes/reactions');
// const bookmarkRoutes     = require('./routes/bookmarks');
// const reportRoutes       = require('./routes/reports');
// const adminRoutes        = require('./routes/admin');
// const notificationRoutes = require('./routes/notifications');

app.use('/api/auth', authRoutes);
// app.use('/api/users',         userRoutes);
// app.use('/api/tags',          tagRoutes);
app.use('/api/courses',       courseRoutes);
app.use('/api/spots',         spotRoutes);
app.use('/api/walks',         walkRoutes);

app.use('/api/reviews',       reviewRoutes);
app.use('/api/reactions',     reactionRoutes);
// app.use('/api/bookmarks',     bookmarkRoutes);
// app.use('/api/reports',       reportRoutes);
// app.use('/api/admin',         adminRoutes);
// app.use('/api/notifications', notificationRoutes);

// ── 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📋 Swagger UI:  http://localhost:${PORT}/api-docs`);
});

module.exports = app;