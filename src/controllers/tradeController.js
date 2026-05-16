const { v4: uuidv4 } = require('uuid');
const db             = require('../config/database');
const { getPrice, COINS } = require('../config/market');
const { credit, debit, getWallet } = require('../services/walletService');
const { createNotification }        = require('../services/notificationService');
const { sendTradeEmail }            = require('../services/emailService');

const FEE_RATE = parseFloat(process.env.TRADING_FEE) || 0.001;   // 0.1%

// ── POST /trade/buy ────────────────────────────────────────────
async function buy(req, res) {
  const { symbol, amountUSD, amountCrypto } = req.body;
  const sym  = symbol?.toUpperCase();

  if (!sym || sym === 'USD' || !COINS[sym])
    return res.status(400).json({ error: 'Invalid symbol' });

  const price = getPrice(sym);
  if (!price) return res.status(503).json({ error: 'Price unavailable' });

  // Determine cost
  let costUSD, qty;
  if (amountUSD) {
    costUSD = parseFloat(amountUSD);
    qty     = costUSD / price;
  } else if (amountCrypto) {
    qty     = parseFloat(amountCrypto);
    costUSD = qty * price;
  } else {
    return res.status(400).json({ error: 'Provide amountUSD or amountCrypto' });
  }

  if (costUSD <= 0 || qty <= 0) return res.status(400).json({ error: 'Amount must be positive' });

  const fee      = costUSD * FEE_RATE;
  const totalCost = costUSD + fee;

  const wallet = getWallet(req.userId);
  if ((wallet.balances.USD || 0) < totalCost)
    return res.status(400).json({
      error: `Insufficient USD. Need $${totalCost.toFixed(2)}, have $${(wallet.balances.USD||0).toFixed(2)}`,
    });

  // Execute
  debit(req.userId, 'USD', totalCost);
  credit(req.userId, sym, qty);

  const trade = {
    id:          uuidv4(),
    userId:      req.userId,
    type:        'buy',
    symbol:      sym,
    amountCrypto: parseFloat(qty.toFixed(10)),
    amountUSD:   parseFloat(costUSD.toFixed(2)),
    fee:         parseFloat(fee.toFixed(6)),
    totalCost:   parseFloat(totalCost.toFixed(2)),
    price,
    status:      'completed',
    createdAt:   new Date().toISOString(),
  };

  db.get('trades').push(trade).write();

  createNotification(req.userId, {
    type: 'trade', title: `Bought ${sym}`,
    message: `You bought ${trade.amountCrypto.toFixed(6)} ${sym} at $${price.toLocaleString()}`,
    meta: { tradeId: trade.id },
  });

  await sendTradeEmail(req.user, trade);
  res.status(201).json({ trade, message: `Successfully bought ${trade.amountCrypto.toFixed(8)} ${sym}` });
}

// ── POST /trade/sell ───────────────────────────────────────────
async function sell(req, res) {
  const { symbol, amountCrypto, amountUSD } = req.body;
  const sym = symbol?.toUpperCase();

  if (!sym || sym === 'USD' || !COINS[sym])
    return res.status(400).json({ error: 'Invalid symbol' });

  const price = getPrice(sym);
  if (!price) return res.status(503).json({ error: 'Price unavailable' });

  let qty, grossUSD;
  if (amountCrypto) {
    qty      = parseFloat(amountCrypto);
    grossUSD = qty * price;
  } else if (amountUSD) {
    grossUSD = parseFloat(amountUSD);
    qty      = grossUSD / price;
  } else {
    return res.status(400).json({ error: 'Provide amountCrypto or amountUSD' });
  }

  if (qty <= 0) return res.status(400).json({ error: 'Amount must be positive' });

  const wallet = getWallet(req.userId);
  if ((wallet.balances[sym] || 0) < qty)
    return res.status(400).json({
      error: `Insufficient ${sym}. Need ${qty.toFixed(8)}, have ${(wallet.balances[sym]||0).toFixed(8)}`,
    });

  const fee    = grossUSD * FEE_RATE;
  const netUSD = grossUSD - fee;

  debit(req.userId, sym, qty);
  credit(req.userId, 'USD', netUSD);

  const trade = {
    id:           uuidv4(),
    userId:       req.userId,
    type:         'sell',
    symbol:       sym,
    amountCrypto: parseFloat(qty.toFixed(10)),
    amountUSD:    parseFloat(netUSD.toFixed(2)),
    grossUSD:     parseFloat(grossUSD.toFixed(2)),
    fee:          parseFloat(fee.toFixed(6)),
    price,
    status:       'completed',
    createdAt:    new Date().toISOString(),
  };

  db.get('trades').push(trade).write();

  createNotification(req.userId, {
    type: 'trade', title: `Sold ${sym}`,
    message: `You sold ${qty.toFixed(6)} ${sym} for $${netUSD.toFixed(2)}`,
    meta: { tradeId: trade.id },
  });

  await sendTradeEmail(req.user, trade);
  res.status(201).json({ trade, message: `Sold ${qty.toFixed(8)} ${sym} for $${netUSD.toFixed(2)}` });
}

// ── GET /trade/history ─────────────────────────────────────────
async function getHistory(req, res) {
  const { symbol, type, page = 1, limit = 20 } = req.query;
  let q = db.get('trades').filter({ userId: req.userId });
  if (symbol) q = q.filter({ symbol: symbol.toUpperCase() });
  if (type)   q = q.filter({ type });

  const all    = q.sortBy('createdAt').reverse().value();
  const total  = all.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const items  = all.slice(offset, offset + parseInt(limit));

  res.json({ trades: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
}

// ── GET /trade/stats ───────────────────────────────────────────
async function getStats(req, res) {
  const trades = db.get('trades').filter({ userId: req.userId }).value();
  if (!trades.length) return res.json({ totalTrades: 0, totalVolume: 0, totalFees: 0, bySymbol: {} });

  const totalVolume = trades.reduce((s, t) => s + (t.grossUSD || t.amountUSD || 0), 0);
  const totalFees   = trades.reduce((s, t) => s + (t.fee || 0), 0);
  const buys        = trades.filter(t => t.type === 'buy').length;
  const sells       = trades.filter(t => t.type === 'sell').length;

  const bySymbol = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { buys: 0, sells: 0, volume: 0 };
    bySymbol[t.symbol][t.type === 'buy' ? 'buys' : 'sells']++;
    bySymbol[t.symbol].volume += (t.grossUSD || t.amountUSD || 0);
  }

  res.json({
    totalTrades: trades.length, buys, sells,
    totalVolume: +totalVolume.toFixed(2),
    totalFees:   +totalFees.toFixed(6),
    bySymbol,
  });
}

// ── GET /trade/:id ─────────────────────────────────────────────
async function getTrade(req, res) {
  const trade = db.get('trades').find({ id: req.params.id, userId: req.userId }).value();
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  res.json(trade);
}

module.exports = { buy, sell, getHistory, getStats, getTrade };
