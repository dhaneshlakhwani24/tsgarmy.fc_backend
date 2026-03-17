const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const scheduleRoutes = require('./routes/scheduleRoutes');
const playerRoutes = require('./routes/playerRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const adminMetricsRoutes = require('./routes/adminMetricsRoutes');
const summaryRoutes = require('./routes/summaryRoutes');
const authRoutes = require('./routes/authRoutes');
const playerAuthRoutes = require('./routes/playerAuthRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const { requestMetricsMiddleware } = require('./utils/metricsStore');
const sseHub = require('./utils/sseHub');

const app = express();
const PORT = process.env.PORT || 5000;
const TRUST_PROXY = process.env.TRUST_PROXY || '1';

app.set('etag', 'strong');
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173', process.env.ADMIN_URL || 'http://localhost:5174']
  .concat(String(process.env.CORS_EXTRA_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean));

const localhostPortRegex = /^https?:\/\/(localhost|127\.0\.0\.1):(51\d{2})$/;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin) || localhostPortRegex.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);
app.use(compression({ threshold: 1024, level: Number(process.env.COMPRESSION_LEVEL || 6) }));

const readApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_READ_RPM || 1500),
  standardHeaders: true,
  legacyHeaders: false,
});

const writeApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_WRITE_RPM || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  if (req.path === '/api/events') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    return next();
  }

  if (req.method === 'GET' && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
  }

  next();
});

app.use('/api', (req, res, next) => {
  if (req.path === '/events') {
    return next();
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return readApiLimiter(req, res, next);
  }

  return writeApiLimiter(req, res, next);
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(requestMetricsMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    immutable: true,
  })
);

app.get('/', (_req, res) => {
  if (_req.accepts('html')) {
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/webp" href="/ogtsglogo1.webp" />
    <title>tsgarmy.fc | API</title>
  </head>
  <body>
    <h1>TSG Army API running</h1>
  </body>
</html>`);
    return;
  }

  res.json({ success: true, message: 'TSG Army API running' });
});

app.use('/api/schedules', scheduleRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin/metrics', adminMetricsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/player-auth', playerAuthRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseHub.addClient(res)) {
    res.write('event: error\ndata: {"message":"SSE capacity reached"}\n\n');
    res.end();
    return;
  }

  res.write('event: connected\ndata: {}\n\n');

  const heartbeat = setInterval(() => res.write(':ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
});

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
