const express   = require('express');
const { body, param, query } = require('express-validator');
const { validate }    = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const authC    = require('../controllers/authController');
const walletC  = require('../controllers/walletController');
const marketC  = require('../controllers/marketController');
const tradeC   = require('../controllers/tradeController');
const referralC= require('../controllers/referralController');
const kycC     = require('../controllers/kycController');
const notifC   = require('../controllers/notificationController');
const supportC = require('../controllers/supportController');
const adminC   = require('../controllers/adminController');

const router = express.Router();

// ════════════════════════════════════════════════
//  AUTH  /api/auth
// ════════════════════════════════════════════════
const auth = express.Router();

auth.post('/register',
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username 3-30 chars'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  validate,
  asyncHandler(authC.register)
);
auth.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  validate,
  asyncHandler(authC.login)
);
auth.post('/refresh',    asyncHandler(authC.refresh));
auth.post('/logout',     authenticate, asyncHandler(authC.logout));
auth.get ('/me',         authenticate, asyncHandler(authC.getMe));
auth.put ('/profile',    authenticate, asyncHandler(authC.updateProfile));
auth.post('/change-password',
  authenticate,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  validate,
  asyncHandler(authC.changePassword)
);
auth.post('/forgot-password',
  body('email').isEmail(), validate,
  asyncHandler(authC.forgotPassword)
);
auth.post('/reset-password',
  body('email').isEmail(),
  body('code').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  validate,
  asyncHandler(authC.resetPassword)
);

// ════════════════════════════════════════════════
//  MARKET  /api/market  (public)
// ════════════════════════════════════════════════
const market = express.Router();
market.get('/prices',           asyncHandler(marketC.getPrices));
market.get('/prices/:symbol',   asyncHandler(marketC.getPrice));
market.get('/search',           asyncHandler(marketC.search));
market.get('/gainers',          asyncHandler(marketC.getGainers));
market.get('/orderbook/:symbol',asyncHandler(marketC.getOrderBook));
market.get('/trades/:symbol',   asyncHandler(marketC.getRecentTrades));
market.get('/chart/:symbol',    asyncHandler(marketC.getChartData));

// ════════════════════════════════════════════════
//  WALLET  /api/wallet  (auth required)
// ════════════════════════════════════════════════
const wallet = express.Router();
wallet.use(authenticate);
wallet.get ('/balance',          asyncHandler(walletC.getBalance));
wallet.get ('/address',          asyncHandler(walletC.getDepositAddress));
wallet.post('/deposit',
  body('currency').notEmpty(),
  body('amount').isFloat({ min: 0.000001 }),
  validate,
  asyncHandler(walletC.deposit)
);
wallet.post('/withdraw',
  body('currency').notEmpty(),
  body('amount').isFloat({ min: 0.000001 }),
  body('address').notEmpty(),
  validate,
  asyncHandler(walletC.withdraw)
);
wallet.get ('/transactions',     asyncHandler(walletC.getTransactions));
wallet.get ('/transactions/:id', asyncHandler(walletC.getTransaction));

// ════════════════════════════════════════════════
//  TRADE  /api/trade  (auth required)
// ════════════════════════════════════════════════
const trade = express.Router();
trade.use(authenticate);
trade.post('/buy',
  body('symbol').notEmpty().toUpperCase(),
  validate,
  asyncHandler(tradeC.buy)
);
trade.post('/sell',
  body('symbol').notEmpty().toUpperCase(),
  validate,
  asyncHandler(tradeC.sell)
);
trade.get ('/history',  asyncHandler(tradeC.getHistory));
trade.get ('/stats',    asyncHandler(tradeC.getStats));
trade.get ('/:id',      asyncHandler(tradeC.getTrade));

// ════════════════════════════════════════════════
//  REFERRAL  /api/referral  (auth required)
// ════════════════════════════════════════════════
const referral = express.Router();
referral.get ('/info',         authenticate, asyncHandler(referralC.getInfo));
referral.post('/validate',     asyncHandler(referralC.validateCode));
referral.get ('/leaderboard',  asyncHandler(referralC.leaderboard));

// ════════════════════════════════════════════════
//  KYC  /api/kyc  (auth required)
// ════════════════════════════════════════════════
const kyc = express.Router();
kyc.use(authenticate);
kyc.post('/submit',  asyncHandler(kycC.submit));
kyc.get ('/status',  asyncHandler(kycC.getStatus));

// ════════════════════════════════════════════════
//  NOTIFICATIONS  /api/notifications
// ════════════════════════════════════════════════
const notif = express.Router();
notif.use(authenticate);
notif.get ('/',        asyncHandler(notifC.list));
notif.put ('/:id/read',asyncHandler(notifC.markAsRead));

// ════════════════════════════════════════════════
//  SUPPORT  /api/support
// ════════════════════════════════════════════════
const support = express.Router();
support.use(authenticate);
support.post('/ticket',          asyncHandler(supportC.createTicket));
support.get ('/tickets',         asyncHandler(supportC.listTickets));
support.get ('/tickets/:id',     asyncHandler(supportC.getTicket));
support.post('/tickets/:id/reply',asyncHandler(supportC.replyToTicket));

// ════════════════════════════════════════════════
//  ADMIN  /api/admin  (admin only)
// ════════════════════════════════════════════════
const admin = express.Router();
admin.use(authenticate, adminOnly);
admin.get ('/dashboard',                 asyncHandler(adminC.getDashboard));
admin.get ('/users',                     asyncHandler(adminC.listUsers));
admin.get ('/users/:id',                 asyncHandler(adminC.getUser));
admin.post('/users/:id/ban',             asyncHandler(adminC.banUser));
admin.post('/users/:id/unban',           asyncHandler(adminC.unbanUser));
admin.post('/users/:id/credit',          asyncHandler(adminC.creditUser));
admin.post('/users/:id/deduct',          asyncHandler(adminC.deductUser));
admin.get ('/kyc/pending',               asyncHandler(adminC.listPendingKyc));
admin.post('/kyc/:id/approve',           asyncHandler(adminC.approveKyc));
admin.post('/kyc/:id/reject',            asyncHandler(adminC.rejectKyc));
admin.get ('/transactions',              asyncHandler(adminC.listTransactions));
admin.post('/transactions/:id/approve',  asyncHandler(adminC.approveTransaction));
admin.post('/transactions/:id/reject',   asyncHandler(adminC.rejectTransaction));
admin.get ('/support',                   asyncHandler(adminC.listTickets));
admin.post('/support/:id/reply',         asyncHandler(adminC.replyTicket));
admin.get ('/audit-log',                 asyncHandler(adminC.getAuditLog));

// ════════════════════════════════════════════════
//  Mount all
// ════════════════════════════════════════════════
router.use('/auth',          auth);
router.use('/market',        market);
router.use('/wallet',        wallet);
router.use('/trade',         trade);
router.use('/referral',      referral);
router.use('/kyc',           kyc);
router.use('/notifications', notif);
router.use('/support',       support);
router.use('/admin',         admin);

module.exports = router;
