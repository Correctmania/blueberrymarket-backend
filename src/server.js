require('dotenv').config();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── MongoDB ────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Blueberryadmin:Donmania1@blueberrymarket.9o48hgg.mongodb.net/blueberrymarket?retryWrites=true&w=majority&appName=Blueberrymarket';

// ── Schemas ────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  referralCode: { type: String, unique: true },
  referredBy:   { type: String, default: null },
  isAdmin:      { type: Boolean, default: false },
  kycVerified:  { type: Boolean, default: false },
  kycStatus:    { type: String, default: 'none' },
  banned:       { type: Boolean, default: false },
  loginCount:   { type: Number, default: 0 },
  lastLogin:    { type: Date, default: null },
  resetToken:   { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
}, { timestamps: true });

const WalletSchema = new mongoose.Schema({
  userId:   { type: String, required: true, unique: true },
  balances: { type: mongoose.Schema.Types.Mixed, default: { USD:0,BTC:0,ETH:0,BNB:0,SOL:0,ADA:0,XRP:0,DOGE:0,AVAX:0,USDT:0,USDC:0 } },
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  type:      { type: String, required: true },
  currency:  { type: String, required: true },
  amount:    { type: Number, required: true },
  fee:       { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  method:    { type: String, default: 'bank_transfer' },
  address:   { type: String, default: null },
  status:    { type: String, default: 'completed' },
  note:      { type: String, default: '' },
}, { timestamps: true });

const TradeSchema = new mongoose.Schema({
  userId:       { type: String, required: true },
  type:         { type: String, required: true },
  symbol:       { type: String, required: true },
  amountCrypto: { type: Number, required: true },
  amountUSD:    { type: Number, required: true },
  grossUSD:     { type: Number, default: 0 },
  fee:          { type: Number, default: 0 },
  price:        { type: Number, required: true },
  status:       { type: String, default: 'completed' },
}, { timestamps: true });

const ReferralSchema = new mongoose.Schema({
  referrerId: String, referredId: String, bonus: { type: Number, default: 10 },
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  userId: String, type: String, title: String, message: String, read: { type: Boolean, default: false },
}, { timestamps: true });

const KycSchema = new mongoose.Schema({
  userId: String, firstName: String, lastName: String, dateOfBirth: String,
  country: String, documentType: String, documentNumber: String,
  status: { type: String, default: 'pending' }, reviewedAt: Date, reviewerNote: String,
}, { timestamps: true });

const SupportSchema = new mongoose.Schema({
  userId: String, subject: String, message: String, category: { type: String, default: 'general' },
  status: { type: String, default: 'open' },
  replies: [{ from: String, message: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

const AdminLogSchema = new mongoose.Schema({
  adminId: String, action: String, meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const User         = mongoose.model('User',         UserSchema);
const Wallet       = mongoose.model('Wallet',       WalletSchema);
const Transaction  = mongoose.model('Transaction',  TransactionSchema);
const Trade        = mongoose.model('Trade',        TradeSchema);
const Referral     = mongoose.model('Referral',     ReferralSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Kyc          = mongoose.model('Kyc',          KycSchema);
const Support      = mongoose.model('Support',      SupportSchema);
const AdminLog     = mongoose.model('AdminLog',     AdminLogSchema);

// ── Market Prices ─────────────────────────────────────────────
const prices = {
  BTC:{symbol:'BTC',name:'Bitcoin',price:67432.50,change24h:2.34,volume:28400000000},
  ETH:{symbol:'ETH',name:'Ethereum',price:3521.80,change24h:-0.87,volume:14200000000},
  BNB:{symbol:'BNB',name:'BNB',price:598.20,change24h:1.12,volume:1900000000},
  SOL:{symbol:'SOL',name:'Solana',price:172.45,change24h:4.56,volume:3100000000},
  ADA:{symbol:'ADA',name:'Cardano',price:0.4512,change24h:-1.23,volume:420000000},
  XRP:{symbol:'XRP',name:'XRP',price:0.6234,change24h:0.78,volume:890000000},
  DOGE:{symbol:'DOGE',name:'Dogecoin',price:0.1423,change24h:3.21,volume:670000000},
  AVAX:{symbol:'AVAX',name:'Avalanche',price:38.92,change24h:-2.11,volume:510000000},
  USDT:{symbol:'USDT',name:'Tether',price:1.0000,change24h:0.01,volume:45000000000},
  USDC:{symbol:'USDC',name:'USD Coin',price:1.0000,change24h:0.00,volume:12000000000},
};
setInterval(() => {
  for (const [sym, coin] of Object.entries(prices)) {
    if (sym==='USDT'||sym==='USDC') continue;
    coin.price = parseFloat((coin.price*(1+(Math.random()-0.489)*0.003)).toFixed(coin.price>=1?2:6));
    coin.change24h = parseFloat((coin.change24h+(Math.random()-0.5)*0.1).toFixed(2));
  }
}, 3000);

// ── Wallet helpers ─────────────────────────────────────────────
async function getWallet(userId) {
  let w = await Wallet.findOne({ userId });
  if (!w) {
    w = await Wallet.create({ userId, balances:{USD:0,BTC:0,ETH:0,BNB:0,SOL:0,ADA:0,XRP:0,DOGE:0,AVAX:0,USDT:0,USDC:0} });
  }
  return w;
}
async function credit(userId, currency, amount) {
  const uid = userId.toString();
  let w = await Wallet.findOne({ userId: uid });
  if (!w) {
    w = await Wallet.create({ userId: uid, balances:{USD:0,BTC:0,ETH:0,BNB:0,SOL:0,ADA:0,XRP:0,DOGE:0,AVAX:0,USDT:0,USDC:0} });
  }
  // Use $inc for atomic update - most reliable way
  const updateKey = `balances.${currency}`;
  const updateObj = {};
  updateObj[updateKey] = parseFloat(amount);
  await Wallet.findOneAndUpdate(
    { userId: uid },
    { $inc: updateObj },
    { new: true, upsert: true }
  );
}
async function debit(userId, currency, amount) {
  const uid = userId.toString();
  const w = await Wallet.findOne({ userId: uid });
  if (!w || (w.balances[currency] || 0) < amount) {
    throw Object.assign(new Error('Insufficient balance'), { status: 400 });
  }
  const updateKey = `balances.${currency}`;
  const updateObj = {};
  updateObj[updateKey] = -parseFloat(amount);
  await Wallet.findOneAndUpdate(
    { userId: uid },
    { $inc: updateObj },
    { new: true }
  );
}

// ── JWT helpers ────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'blueberry_secret_2025';
function signToken(userId) { return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' }); }
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { userId } = jwt.verify(h.split(' ')[1], JWT_SECRET);
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'Account suspended' });
    req.userId = userId; req.user = user; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}
function adminOnly(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Middleware ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/api/', rateLimit({ windowMs: 60000, max: 500, message: { error: 'Too many requests.' } }));
app.use('/api/auth/', rateLimit({ windowMs: 60000, max: 50, message: { error: 'Too many attempts. Wait 1 minute.' } }));

// ════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════

// Health
app.get('/health', (req, res) => res.json({ status:'ok', service:'BlueberryMarket API', version:'1.0.0', uptime:process.uptime(), ts:new Date().toISOString() }));

// ── AUTH ───────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, referralCode } = req.body;
    if (!username||!email||!password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
    const exists = await User.findOne({ $or:[{email:email.toLowerCase()},{username}] });
    if (exists) return res.status(409).json({ error: exists.email===email.toLowerCase() ? 'Email already registered' : 'Username taken' });
    const passwordHash = await bcrypt.hash(password, 12);
    const myCode = 'BB'+Math.random().toString(36).slice(2,8).toUpperCase();
    let referrerId = null;
    if (referralCode) {
      const ref = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (ref) referrerId = ref._id.toString();
    }
    const user = await User.create({ username:username.trim(), email:email.toLowerCase().trim(), passwordHash, referralCode:myCode, referredBy:referrerId });
    const userId = user._id.toString();
    await credit(userId, 'USD', 1000);
    if (referrerId) {
      await credit(referrerId, 'USD', 10);
      await credit(userId, 'USD', 10);
      await Referral.create({ referrerId, referredId: userId, bonus: 10 });
      await Notification.create({ userId: referrerId, type:'referral', title:'Referral Bonus!', message:`${username} joined using your code. You earned $10!` });
    }
    await Notification.create({ userId, type:'system', title:'Welcome to BlueberryMarket! 🫐', message:'Your account is ready. You have $1,000 demo balance!' });
    const token = signToken(userId);
    const safe = user.toObject(); delete safe.passwordHash;
    res.status(201).json({ accessToken:token, user:safe });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.banned) return res.status(403).json({ error: 'Account suspended' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    user.loginCount = (user.loginCount||0)+1; user.lastLogin = new Date(); await user.save();
    const token = signToken(user._id.toString());
    const safe = user.toObject(); delete safe.passwordHash;
    res.json({ accessToken:token, user:safe });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash -resetToken');
  res.json(user);
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const { username } = req.body;
  const user = await User.findById(req.userId);
  if (username) { const taken = await User.findOne({username}); if(taken&&taken._id.toString()!==req.userId) return res.status(409).json({error:'Username taken'}); user.username=username; }
  await user.save();
  res.json(user);
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.userId);
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ message: 'Password changed' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });
  if (user) {
    const code = Math.floor(100000+Math.random()*900000).toString();
    user.resetToken = code; user.resetTokenExpiry = new Date(Date.now()+15*60*1000);
    await user.save();
    console.log(`Reset code for ${user.email}: ${code}`);
  }
  res.json({ message: 'If that email exists, a reset code has been sent.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user||user.resetToken!==code||new Date()>new Date(user.resetTokenExpiry))
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetToken = null; user.resetTokenExpiry = null;
  await user.save();
  res.json({ message: 'Password reset successfully' });
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const { userId } = jwt.verify(refreshToken, JWT_SECRET);
    res.json({ accessToken: signToken(userId) });
  } catch { res.status(401).json({ error: 'Invalid refresh token' }); }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => res.json({ message: 'Logged out' }));

// ── MARKET ─────────────────────────────────────────────────────
app.get('/api/market/prices', (req, res) => {
  const list = Object.values(prices).map(c => ({ ...c, marketCap: +(c.price * 19700000).toFixed(0) }));
  res.json({ prices: list, timestamp: new Date().toISOString() });
});

app.get('/api/market/prices/:symbol', (req, res) => {
  const coin = prices[req.params.symbol.toUpperCase()];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });
  const history = Array.from({length:30},(_,i)=>({ date:new Date(Date.now()-i*86400000).toISOString().split('T')[0], price:+(coin.price*(1+(Math.random()-0.5)*0.05)).toFixed(2) })).reverse();
  res.json({ ...coin, history });
});

app.get('/api/market/search', (req, res) => {
  const q = (req.query.q||'').toLowerCase();
  const results = Object.values(prices).filter(c=>c.symbol.toLowerCase().includes(q)||c.name.toLowerCase().includes(q));
  res.json({ results });
});

app.get('/api/market/gainers', (req, res) => {
  const all = Object.values(prices);
  res.json({ gainers: [...all].sort((a,b)=>b.change24h-a.change24h).slice(0,5), losers: [...all].sort((a,b)=>a.change24h-b.change24h).slice(0,5) });
});

app.get('/api/market/orderbook/:symbol', (req, res) => {
  const coin = prices[req.params.symbol.toUpperCase()];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });
  const bids = Array.from({length:10},(_,i)=>({ price:+(coin.price*(1-(i+1)*0.001)).toFixed(2), amount:+(Math.random()*2+0.1).toFixed(4) }));
  const asks = Array.from({length:10},(_,i)=>({ price:+(coin.price*(1+(i+1)*0.001)).toFixed(2), amount:+(Math.random()*2+0.1).toFixed(4) }));
  res.json({ symbol:req.params.symbol.toUpperCase(), bids, asks, midPrice:coin.price });
});

app.get('/api/market/trades/:symbol', (req, res) => {
  const coin = prices[req.params.symbol.toUpperCase()];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });
  const trades = Array.from({length:20},(_,i)=>({ side:Math.random()>0.5?'buy':'sell', price:+(coin.price*(1+(Math.random()-0.5)*0.002)).toFixed(2), amount:+(Math.random()*0.5+0.001).toFixed(4), timestamp:new Date(Date.now()-i*4000).toISOString() }));
  res.json({ symbol:req.params.symbol.toUpperCase(), trades });
});

app.get('/api/market/chart/:symbol', (req, res) => {
  const coin = prices[req.params.symbol.toUpperCase()];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });
  const days = parseInt(req.query.days)||30;
  let p = coin.price * 0.9;
  const candles = Array.from({length:days},(_,i)=>{
    const open=p, close=p*(1+(Math.random()-0.48)*0.03);
    p=close;
    return { date:new Date(Date.now()-(days-i)*86400000).toISOString().split('T')[0], open:+open.toFixed(2), high:+(Math.max(open,close)*1.01).toFixed(2), low:+(Math.min(open,close)*0.99).toFixed(2), close:+close.toFixed(2) };
  });
  res.json({ symbol:req.params.symbol.toUpperCase(), candles });
});

// ── WALLET ─────────────────────────────────────────────────────
app.get('/api/wallet/balance', authMiddleware, async (req, res) => {
  const uid = req.userId.toString();
  const w = await Wallet.findOne({ userId: uid });
  if (!w) {
    // Create wallet with 0 balances if not exists
    await Wallet.create({ userId: uid, balances:{USD:0,BTC:0,ETH:0,BNB:0,SOL:0,ADA:0,XRP:0,DOGE:0,AVAX:0,USDT:0,USDC:0} });
    return res.json({ assets: [], totalUSD: 0 });
  }
  // Convert Mongoose Mixed type to plain object
  const bal = w.toObject().balances || {};
  const assets = Object.entries(bal).map(([sym,amt])=>({
    symbol: sym,
    amount: parseFloat(amt) || 0,
    priceUSD: sym==='USD' ? 1 : (prices[sym]?.price || 0),
    valueUSD: +((sym==='USD' ? 1 : (prices[sym]?.price||0)) * (parseFloat(amt)||0)).toFixed(2)
  }));
  assets.sort((a,b)=>b.valueUSD-a.valueUSD);
  const totalUSD = +assets.reduce((s,a)=>s+a.valueUSD,0).toFixed(2);
  res.json({ assets, totalUSD });
});

app.get('/api/wallet/address', authMiddleware, (req, res) => {
  const cur = req.query.currency?.toUpperCase()||'BTC';
  res.json({ currency:cur, address:`${cur}_address_${req.userId.slice(0,12)}`, network:cur });
});

app.post('/api/wallet/deposit', authMiddleware, async (req, res) => {
  try {
    const { currency, amount, method } = req.body;
    const cur = currency?.toUpperCase();
    const amt = parseFloat(amount);
    if (!cur||!amt||amt<=0) return res.status(400).json({ error: 'Invalid request' });
    const tx = await Transaction.create({ userId:req.userId, type:'deposit', currency:cur, amount:amt, fee:0, netAmount:amt, method:method||'bank_transfer', status:'completed' });
    await credit(req.userId, cur, amt);
    await Notification.create({ userId:req.userId, type:'deposit', title:'Deposit Received', message:`${amt} ${cur} credited to your wallet.` });
    res.status(201).json({ transaction:tx, message:`${amt} ${cur} credited` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { currency, amount, address } = req.body;
    const cur = currency?.toUpperCase();
    const amt = parseFloat(amount);
    if (!cur||!amt||amt<=0) return res.status(400).json({ error: 'Invalid request' });
    if (!address) return res.status(400).json({ error: 'Address required' });
    const fee = cur==='USD' ? 2.5 : amt*0.001;
    const net = amt-fee;
    if (net<=0) return res.status(400).json({ error: 'Amount too small after fees' });
    try { await debit(req.userId, cur, amt); } catch(e) { return res.status(400).json({ error: e.message }); }
    const tx = await Transaction.create({ userId:req.userId, type:'withdrawal', currency:cur, amount:amt, fee:+fee.toFixed(8), netAmount:+net.toFixed(8), address, status:'pending' });
    setTimeout(async()=>{ await Transaction.findByIdAndUpdate(tx._id,{status:'completed'}); },10000);
    await Notification.create({ userId:req.userId, type:'withdrawal', title:'Withdrawal Submitted', message:`${amt} ${cur} withdrawal is being processed.` });
    res.status(201).json({ transaction:tx, message:'Withdrawal submitted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/wallet/transactions', authMiddleware, async (req, res) => {
  const { type, status, page=1, limit=20 } = req.query;
  const q = { userId:req.userId };
  if (type) q.type=type; if (status) q.status=status;
  const total = await Transaction.countDocuments(q);
  const items = await Transaction.find(q).sort({createdAt:-1}).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ transactions:items, total });
});

app.get('/api/wallet/transactions/:id', authMiddleware, async (req, res) => {
  const tx = await Transaction.findOne({ _id:req.params.id, userId:req.userId });
  if (!tx) return res.status(404).json({ error: 'Not found' });
  res.json(tx);
});

// ── TRADE ──────────────────────────────────────────────────────
app.post('/api/trade/buy', authMiddleware, async (req, res) => {
  try {
    const { symbol, amountUSD, amountCrypto } = req.body;
    const sym = symbol?.toUpperCase();
    if (!sym||sym==='USD'||!prices[sym]) return res.status(400).json({ error: 'Invalid symbol' });
    const price = prices[sym].price;
    let costUSD, qty;
    if (amountUSD) { costUSD=parseFloat(amountUSD); qty=costUSD/price; }
    else if (amountCrypto) { qty=parseFloat(amountCrypto); costUSD=qty*price; }
    else return res.status(400).json({ error: 'Provide amountUSD or amountCrypto' });
    if (costUSD<=0) return res.status(400).json({ error: 'Amount must be positive' });
    const fee=costUSD*0.001, total=costUSD+fee;
    const w = await getWallet(req.userId);
    if ((w.balances.USD||0)<total) return res.status(400).json({ error:`Insufficient USD. Need $${total.toFixed(2)}, have $${(w.balances.USD||0).toFixed(2)}` });
    await debit(req.userId,'USD',total);
    await credit(req.userId,sym,qty);
    const trade = await Trade.create({ userId:req.userId, type:'buy', symbol:sym, amountCrypto:+qty.toFixed(10), amountUSD:+costUSD.toFixed(2), fee:+fee.toFixed(6), price });
    await Notification.create({ userId:req.userId, type:'trade', title:`Bought ${sym}`, message:`You bought ${qty.toFixed(6)} ${sym} at $${price.toLocaleString()}` });
    res.status(201).json({ trade, message:`Successfully bought ${qty.toFixed(8)} ${sym}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trade/sell', authMiddleware, async (req, res) => {
  try {
    const { symbol, amountCrypto, amountUSD } = req.body;
    const sym = symbol?.toUpperCase();
    if (!sym||sym==='USD'||!prices[sym]) return res.status(400).json({ error: 'Invalid symbol' });
    const price = prices[sym].price;
    let qty, grossUSD;
    if (amountCrypto) { qty=parseFloat(amountCrypto); grossUSD=qty*price; }
    else if (amountUSD) { grossUSD=parseFloat(amountUSD); qty=grossUSD/price; }
    else return res.status(400).json({ error: 'Provide amountCrypto or amountUSD' });
    if (qty<=0) return res.status(400).json({ error: 'Amount must be positive' });
    const w = await getWallet(req.userId);
    if ((w.balances[sym]||0)<qty) return res.status(400).json({ error:`Insufficient ${sym}` });
    const fee=grossUSD*0.001, net=grossUSD-fee;
    await debit(req.userId,sym,qty);
    await credit(req.userId,'USD',net);
    const trade = await Trade.create({ userId:req.userId, type:'sell', symbol:sym, amountCrypto:+qty.toFixed(10), amountUSD:+net.toFixed(2), grossUSD:+grossUSD.toFixed(2), fee:+fee.toFixed(6), price });
    await Notification.create({ userId:req.userId, type:'trade', title:`Sold ${sym}`, message:`You sold ${qty.toFixed(6)} ${sym} for $${net.toFixed(2)}` });
    res.status(201).json({ trade, message:`Sold ${qty.toFixed(8)} ${sym} for $${net.toFixed(2)}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trade/history', authMiddleware, async (req, res) => {
  const { symbol, type, page=1, limit=20 } = req.query;
  const q = { userId:req.userId };
  if (symbol) q.symbol=symbol.toUpperCase(); if (type) q.type=type;
  const total = await Trade.countDocuments(q);
  const trades = await Trade.find(q).sort({createdAt:-1}).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ trades, total });
});

app.get('/api/trade/stats', authMiddleware, async (req, res) => {
  const trades = await Trade.find({ userId:req.userId });
  if (!trades.length) return res.json({ totalTrades:0, totalVolume:0, totalFees:0 });
  res.json({ totalTrades:trades.length, buys:trades.filter(t=>t.type==='buy').length, sells:trades.filter(t=>t.type==='sell').length, totalVolume:+trades.reduce((s,t)=>s+(t.grossUSD||t.amountUSD||0),0).toFixed(2), totalFees:+trades.reduce((s,t)=>s+(t.fee||0),0).toFixed(6) });
});

app.get('/api/trade/:id', authMiddleware, async (req, res) => {
  const t = await Trade.findOne({ _id:req.params.id, userId:req.userId });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// ── REFERRAL ───────────────────────────────────────────────────
app.get('/api/referral/info', authMiddleware, async (req, res) => {
  const refs = await Referral.find({ referrerId:req.userId });
  const referrals = await Promise.all(refs.map(async r => { const u=await User.findById(r.referredId); return { username:u?.username||'Unknown', joinedAt:r.createdAt, bonus:r.bonus }; }));
  res.json({ referralCode:req.user.referralCode, referralLink:`https://blueberrymarket.netlify.app/register?ref=${req.user.referralCode}`, totalReferrals:refs.length, totalEarned:refs.reduce((s,r)=>s+(r.bonus||0),0), referrals });
});

app.post('/api/referral/validate', async (req, res) => {
  const { code } = req.body;
  const user = await User.findOne({ referralCode: code?.toUpperCase() });
  if (!user) return res.json({ valid:false });
  res.json({ valid:true, referrerUsername:user.username, bonus:10 });
});

app.get('/api/referral/leaderboard', async (req, res) => {
  const refs = await Referral.find();
  const counts = {};
  for (const r of refs) counts[r.referrerId]=(counts[r.referrerId]||0)+1;
  const sorted = await Promise.all(Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(async([uid,count])=>{ const u=await User.findById(uid); return {username:u?.username||'Unknown',referrals:count}; }));
  res.json({ leaderboard:sorted });
});

// ── KYC ────────────────────────────────────────────────────────
app.post('/api/kyc/submit', authMiddleware, async (req, res) => {
  const user = req.user;
  if (user.kycStatus==='verified') return res.status(400).json({ error:'Already verified' });
  const { firstName,lastName,dateOfBirth,country,documentType,documentNumber } = req.body;
  if (!firstName||!lastName||!country||!documentType||!documentNumber) return res.status(422).json({ error:'All fields required' });
  await Kyc.create({ userId:req.userId, firstName,lastName,dateOfBirth,country,documentType,documentNumber });
  await User.findByIdAndUpdate(req.userId, { kycStatus:'pending' });
  await Notification.create({ userId:req.userId, type:'kyc', title:'KYC Submitted', message:'Your documents are under review.' });
  res.status(201).json({ message:'KYC submitted', status:'pending' });
});

app.get('/api/kyc/status', authMiddleware, async (req, res) => {
  const record = await Kyc.findOne({ userId:req.userId }).sort({createdAt:-1});
  res.json({ kycStatus:req.user.kycStatus, kycVerified:req.user.kycVerified, submittedAt:record?.createdAt||null });
});

// ── NOTIFICATIONS ──────────────────────────────────────────────
app.get('/api/notifications', authMiddleware, async (req, res) => {
  const notifs = await Notification.find({ userId:req.userId }).sort({createdAt:-1}).limit(30);
  const unread = await Notification.countDocuments({ userId:req.userId, read:false });
  res.json({ notifications:notifs, unreadCount:unread });
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  if (req.params.id==='all') await Notification.updateMany({ userId:req.userId },{ read:true });
  else await Notification.findOneAndUpdate({ _id:req.params.id, userId:req.userId },{ read:true });
  res.json({ message:'Marked as read' });
});

// ── SUPPORT ────────────────────────────────────────────────────
app.post('/api/support/ticket', authMiddleware, async (req, res) => {
  const { subject, message, category } = req.body;
  if (!subject||!message) return res.status(422).json({ error:'Subject and message required' });
  const ticket = await Support.create({ userId:req.userId, subject, message, category:category||'general' });
  res.status(201).json({ ticket });
});

app.get('/api/support/tickets', authMiddleware, async (req, res) => {
  const tickets = await Support.find({ userId:req.userId }).sort({createdAt:-1});
  res.json({ tickets });
});

app.get('/api/support/tickets/:id', authMiddleware, async (req, res) => {
  const t = await Support.findOne({ _id:req.params.id, userId:req.userId });
  if (!t) return res.status(404).json({ error:'Not found' });
  res.json(t);
});

app.post('/api/support/tickets/:id/reply', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(422).json({ error:'Message required' });
  const t = await Support.findOne({ _id:req.params.id, userId:req.userId });
  if (!t) return res.status(404).json({ error:'Not found' });
  t.replies.push({ from:'user', message, createdAt:new Date() });
  t.status='in_progress'; await t.save();
  res.json({ ticket:t });
});

// ── ADMIN ──────────────────────────────────────────────────────
app.get('/api/admin/dashboard', authMiddleware, adminOnly, async (req, res) => {
  const [totalUsers,totalTrades,allTx,openTickets,referrals] = await Promise.all([
    User.countDocuments(), Trade.countDocuments(), Transaction.find(), Support.countDocuments({status:'open'}), Referral.countDocuments()
  ]);
  const deposits=allTx.filter(t=>t.type==='deposit'), withdrawals=allTx.filter(t=>t.type==='withdrawal');
  const recentUsers = await User.find().sort({createdAt:-1}).limit(5).select('username email kycStatus createdAt');
  const recentTrades = await Trade.find().sort({createdAt:-1}).limit(5);
  res.json({ stats:{ totalUsers, activeUsers:await User.countDocuments({banned:false}), kycVerified:await User.countDocuments({kycVerified:true}), kycPending:await User.countDocuments({kycStatus:'pending'}), totalTrades, totalDeposits:deposits.length, totalWithdrawals:withdrawals.length, depositVolume:+deposits.reduce((s,t)=>s+(t.amount||0),0).toFixed(2), withdrawalVolume:+withdrawals.reduce((s,t)=>s+(t.amount||0),0).toFixed(2), tradeVolume:+(await Trade.find()).reduce((s,t)=>s+(t.grossUSD||t.amountUSD||0),0).toFixed(2), openTickets, referrals }, recentUsers, recentTrades });
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const { q, page=1, limit=20, kycStatus, banned } = req.query;
  const query = {};
  if (q) query.$or=[{username:new RegExp(q,'i')},{email:new RegExp(q,'i')}];
  if (kycStatus) query.kycStatus=kycStatus;
  if (banned!==undefined) query.banned=banned==='true';
  const total = await User.countDocuments(query);
  const users = await User.find(query).select('-passwordHash -resetToken').sort({createdAt:-1}).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ users, total });
});

app.get('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id).select('-passwordHash -resetToken');
  if (!user) return res.status(404).json({ error:'Not found' });
  const wallet = await Wallet.findOne({ userId:req.params.id });
  const trades = await Trade.find({ userId:req.params.id }).sort({createdAt:-1}).limit(10);
  const txs    = await Transaction.find({ userId:req.params.id }).sort({createdAt:-1}).limit(10);
  res.json({ user, wallet:wallet?.balances||{}, recentTrades:trades, recentTransactions:txs });
});

app.post('/api/admin/users/:id/ban', authMiddleware, adminOnly, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { banned:true }, { new:true });
  if (!user) return res.status(404).json({ error:'Not found' });
  await AdminLog.create({ adminId:req.userId, action:'ban_user', meta:{ targetUserId:req.params.id } });
  res.json({ message:`User ${user.username} banned` });
});

app.post('/api/admin/users/:id/unban', authMiddleware, adminOnly, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { banned:false }, { new:true });
  if (!user) return res.status(404).json({ error:'Not found' });
  res.json({ message:`User ${user.username} unbanned` });
});

app.post('/api/admin/users/:id/credit', authMiddleware, adminOnly, async (req, res) => {
  const { currency, amount, note } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error:'Not found' });
  const amt = parseFloat(amount);
  if (!currency||!amt||amt<=0) return res.status(422).json({ error:'currency and amount required' });
  await credit(req.params.id, currency.toUpperCase(), amt);
  const tx = await Transaction.create({ userId:req.params.id, type:'admin_credit', currency:currency.toUpperCase(), amount:amt, fee:0, netAmount:amt, method:'admin', status:'completed', note:note||`Admin credit` });
  await AdminLog.create({ adminId:req.userId, action:'credit_user', meta:{ targetUserId:req.params.id, currency, amount:amt } });
  await Notification.create({ userId:req.params.id, type:'deposit', title:'Funds Credited', message:`${amt} ${currency.toUpperCase()} added to your account.` });
  res.json({ message:`Credited ${amt} ${currency} to ${user.username}`, transaction:tx });
});

app.post('/api/admin/users/:id/deduct', authMiddleware, adminOnly, async (req, res) => {
  const { currency, amount } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error:'Not found' });
  try { await debit(req.params.id, currency.toUpperCase(), parseFloat(amount)); }
  catch(e) { return res.status(400).json({ error:e.message }); }
  await AdminLog.create({ adminId:req.userId, action:'deduct_user', meta:{ targetUserId:req.params.id, currency, amount } });
  res.json({ message:`Deducted ${amount} ${currency} from ${user.username}` });
});

app.get('/api/admin/kyc/pending', authMiddleware, adminOnly, async (req, res) => {
  const pending = await Kyc.find({ status:'pending' }).sort({createdAt:1});
  res.json({ pending, count:pending.length });
});

app.post('/api/admin/kyc/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  const r = await Kyc.findByIdAndUpdate(req.params.id, { status:'verified', reviewedAt:new Date() }, { new:true });
  if (!r) return res.status(404).json({ error:'Not found' });
  await User.findByIdAndUpdate(r.userId, { kycVerified:true, kycStatus:'verified' });
  await Notification.create({ userId:r.userId, type:'kyc', title:'KYC Approved ✅', message:'Your identity has been verified!' });
  res.json({ message:'KYC approved' });
});

app.post('/api/admin/kyc/:id/reject', authMiddleware, adminOnly, async (req, res) => {
  const { reason } = req.body;
  const r = await Kyc.findByIdAndUpdate(req.params.id, { status:'rejected', reviewedAt:new Date(), reviewerNote:reason||'Could not verify' }, { new:true });
  if (!r) return res.status(404).json({ error:'Not found' });
  await User.findByIdAndUpdate(r.userId, { kycStatus:'rejected' });
  await Notification.create({ userId:r.userId, type:'kyc', title:'KYC Rejected', message:`KYC rejected: ${reason||'Please resubmit'}` });
  res.json({ message:'KYC rejected' });
});

app.get('/api/admin/transactions', authMiddleware, adminOnly, async (req, res) => {
  const { type, status, page=1, limit=30 } = req.query;
  const q = {};
  if (type) q.type=type; if (status) q.status=status;
  const total = await Transaction.countDocuments(q);
  const transactions = await Transaction.find(q).sort({createdAt:-1}).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ transactions, total });
});

app.post('/api/admin/transactions/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  const tx = await Transaction.findByIdAndUpdate(req.params.id, { status:'completed' }, { new:true });
  if (!tx) return res.status(404).json({ error:'Not found' });
  await Notification.create({ userId:tx.userId, type:'system', title:'Transaction Approved', message:`Your ${tx.type} of ${tx.amount} ${tx.currency} approved.` });
  res.json({ message:'Approved', transaction:tx });
});

app.post('/api/admin/transactions/:id/reject', authMiddleware, adminOnly, async (req, res) => {
  const { reason } = req.body;
  const tx = await Transaction.findById(req.params.id);
  if (!tx) return res.status(404).json({ error:'Not found' });
  if (tx.status!=='pending') return res.status(400).json({ error:'Only pending can be rejected' });
  if (tx.type==='withdrawal') await credit(tx.userId, tx.currency, tx.amount);
  await Transaction.findByIdAndUpdate(req.params.id, { status:'rejected', note:reason||'Rejected' });
  res.json({ message:'Rejected' });
});

app.get('/api/admin/support', authMiddleware, adminOnly, async (req, res) => {
  const { status, page=1, limit=20 } = req.query;
  const q = {}; if (status) q.status=status;
  const total = await Support.countDocuments(q);
  const tickets = await Support.find(q).sort({createdAt:-1}).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ tickets, total });
});

app.post('/api/admin/support/:id/reply', authMiddleware, adminOnly, async (req, res) => {
  const { message, status } = req.body;
  if (!message) return res.status(422).json({ error:'message required' });
  const t = await Support.findById(req.params.id);
  if (!t) return res.status(404).json({ error:'Not found' });
  t.replies.push({ from:'admin', message, createdAt:new Date() });
  if (status) t.status=status; await t.save();
  await Notification.create({ userId:t.userId, type:'system', title:'Support Reply', message:`Support replied to: "${t.subject}"` });
  res.json({ ticket:t });
});

app.get('/api/admin/audit-log', authMiddleware, adminOnly, async (req, res) => {
  const logs = await AdminLog.find().sort({createdAt:-1}).limit(100);
  res.json({ logs });
});

// ── 404 ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error:`Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error:'Internal server error' }); });

// ── START ──────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // Auto-create admin with YOUR credentials
    const adminExists = await User.findOne({ email:'aiconfidence1@gmail.com' });
    if (!adminExists) {
      const hash = await bcrypt.hash('Donmania', 12);
      const admin = await User.create({ username:'admin', email:'aiconfidence1@gmail.com', passwordHash:hash, referralCode:'BBADMIN01', isAdmin:true, kycVerified:true, kycStatus:'verified', emailVerified:true });
      await credit(admin._id.toString(),'USD',999999);
      console.log('✅ Admin created: aiconfidence1@gmail.com / Donmania');
    } else {
      const hash = await bcrypt.hash('Donmania', 12);
      await User.findByIdAndUpdate(adminExists._id,{ isAdmin:true, kycVerified:true, passwordHash:hash });
      console.log('✅ Admin updated: aiconfidence1@gmail.com');
    }

    server.listen(PORT, () => {
      console.log(`\n🫐 BlueberryMarket API running on port ${PORT}\n`);
    });
  } catch(err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
module.exports = { app, server };
