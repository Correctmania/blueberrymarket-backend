require('dotenv').config();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB }    = require('./config/mongodb');
const routes           = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startPriceEngine }       = require('./config/market');
const { createWebSocketServer }  = require('./services/websocketService');
const { startCronJobs }          = require('./services/cronService');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api/', rateLimit({ windowMs: 60000, max: 500, message: { error: 'Too many requests.' } }));
app.use('/api/auth/', rateLimit({ windowMs: 60000, max: 50, message: { error: 'Too many attempts. Wait 1 minute.' } }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'BlueberryMarket API', version: '1.0.0', uptime: process.uptime(), ts: new Date().toISOString() }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  const { User } = require('./models');
  const bcrypt = require('bcryptjs');
  const { credit } = require('./services/walletService');
  const adminExists = await User.findOne({ email: 'admin@blueberrymarket.com' });
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin@12345', 12);
    const admin = await User.create({ username: 'admin', email: 'admin@blueberrymarket.com', passwordHash: hash, referralCode: 'BBADMIN01', isAdmin: true, kycVerified: true, kycStatus: 'verified', emailVerified: true });
    await credit(admin._id.toString(), 'USD', 999999);
    console.log('✅ Admin account auto-created');
  } else {
    await User.findByIdAndUpdate(adminExists._id, { isAdmin: true });
  }

  server.listen(PORT, () => {
    console.log('\n🫐 BlueberryMarket API running on port ' + PORT);
    startPriceEngine();
    createWebSocketServer(server);
    startCronJobs();
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
module.exports = { app, server };
