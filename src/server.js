require('dotenv').config();
const express        = require('express');
const http           = require('http');
const cors           = require('cors');
const helmet         = require('helmet');
const morgan         = require('morgan');
const rateLimit      = require('express-rate-limit');
const fs             = require('fs');
const path           = require('path');

const routes                  = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startPriceEngine }    = require('./config/market');
const { createWebSocketServer } = require('./services/websocketService');
const { startCronJobs }       = require('./services/cronService');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── Logging ────────────────────────────────────────────────────
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const accessLog = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLog }));
app.use(morgan('dev'));

// ── Security ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin:  process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parser ────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter ────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please slow down.' },
}));

// Stricter limit for auth endpoints
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  message:  { error: 'Too many auth attempts. Try again in 15 minutes.' },
}));

// ── Health check (no rate limit) ───────────────────────────────
app.get('/health', (req, res) => res.json({
  status:  'ok',
  service: 'BlueberryMarket API',
  version: '1.0.0',
  uptime:  process.uptime(),
  ts:      new Date().toISOString(),
}));

// ── API routes ─────────────────────────────────────────────────
app.use('/api', routes);

// ── API docs summary ───────────────────────────────────────────
app.get('/api', (req, res) => res.json({
  name:    'BlueberryMarket API',
  version: '1.0.0',
  endpoints: {
    auth:          '/api/auth',
    market:        '/api/market',
    wallet:        '/api/wallet',
    trade:         '/api/trade',
    referral:      '/api/referral',
    kyc:           '/api/kyc',
    notifications: '/api/notifications',
    support:       '/api/support',
    admin:         '/api/admin',
    websocket:     `ws://localhost:${PORT}/ws`,
  },
}));

// ── 404 & error handler ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start services ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('\n🫐 ══════════════════════════════════════════');
  console.log(`   BlueberryMarket API  v1.0.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ws://localhost:${PORT}/ws`);
  console.log('════════════════════════════════════════════\n');

  startPriceEngine();
  console.log('✅ Market price engine started');

  createWebSocketServer(server);
  console.log('✅ WebSocket server started');

  startCronJobs();
  console.log('✅ Cron jobs started\n');
});

// ── Graceful shutdown ──────────────────────────────────────────
process.on('SIGTERM', () => { console.log('Shutting down...'); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { console.log('Shutting down...'); server.close(() => process.exit(0)); });

module.exports = { app, server };
