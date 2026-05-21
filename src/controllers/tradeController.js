const { Trade } = require('../models');
const { getPrice, COINS } = require('../config/market');
const { credit, debit, getWallet } = require('../services/walletService');
const { createNotification } = require('../services/notificationService');
const { sendTradeEmail } = require('../services/emailService');
const FEE_RATE = parseFloat(process.env.TRADING_FEE) || 0.001;

async function buy(req, res) {
  const { symbol, amountUSD, amountCrypto } = req.body;
  const sym = symbol?.toUpperCase();
  if (!sym || sym === 'USD' || !COINS[sym]) return res.status(400).json({ error: 'Invalid symbol' });
  const price = getPrice(sym);
  if (!price) return res.status(503).json({ error: 'Price unavailable' });
  let costUSD, qty;
  if (amountUSD) { costUSD = parseFloat(amountUSD); qty = costUSD / price; }
  else if (amountCrypto) { qty = parseFloat(amountCrypto); costUSD = qty * price; }
  else return res.status(400).json({ error: 'Provide amountUSD or amountCrypto' });
  if (costUSD <= 0 || qty <= 0) return res.status(400).json({ error: 'Amount must be positive' });
  const fee = costUSD * FEE_RATE;
  const totalCost = costUSD + fee;
  const wallet = await getWallet(req.userId);
  if ((wallet.balances.USD || 0) < totalCost)
    return res.status(400).json({ error: `Insufficient USD. Need $${totalCost.toFixed(2)}, have $${(wallet.balances.USD||0).toFixed(2)}` });
  await debit(req.userId, 'USD', totalCost);
  await credit(req.userId, sym, qty);
  const trade = await Trade.create({ userId: req.userId, type: 'buy', symbol: sym, amountCrypto: parseFloat(qty.toFixed(10)), amountUSD: parseFloat(costUSD.toFixed(2)), fee: parseFloat(fee.toFixed(6)), totalCost: parseFloat(totalCost.toFixed(2)), price });
  await createNotification(req.userId, { type: 'trade', title: `Bought ${sym}`, message: `You bought ${qty.toFixed(6)} ${sym} at $${price.toLocaleString()}` });
  await sendTradeEmail(req.user, trade);
  res.status(201).json({ trade, message: `Successfully bought ${qty.toFixed(8)} ${sym}` });
}

async function sell(req, res) {
  const { symbol, amountCrypto, amountUSD } = req.body;
  const sym = symbol?.toUpperCase();
  if (!sym || sym === 'USD' || !COINS[sym]) return res.status(400).json({ error: 'Invalid symbol' });
  const price = getPrice(sym);
  if (!price) return res.status(503).json({ error: 'Price unavailable' });
  let qty, grossUSD;
  if (amountCrypto) { qty = parseFloat(amountCrypto); grossUSD = qty * price; }
  else if (amountUSD) { grossUSD = parseFloat(amountUSD); qty = grossUSD / price; }
  else return res.status(400).json({ error: 'Provide amountCrypto or amountUSD' });
  if (qty <= 0) return res.status(400).json({ error: 'Amount must be positive' });
  const wallet = await getWallet(req.userId);
  if ((wallet.balances[sym] || 0) < qty)
    return res.status(400).json({ error: `Insufficient ${sym}. Need ${qty.toFixed(8)}, have ${(wallet.balances[sym]||0).toFixed(8)}` });
  const fee = grossUSD * FEE_RATE;
  const netUSD = grossUSD - fee;
  await debit(req.userId, sym, qty);
  await credit(req.userId, 'USD', netUSD);
  const trade = await Trade.create({ userId: req.userId, type: 'sell', symbol: sym, amountCrypto: parseFloat(qty.toFixed(10)), amountUSD: parseFloat(netUSD.toFixed(2)), grossUSD: parseFloat(grossUSD.toFixed(2)), fee: parseFloat(fee.toFixed(6)), price });
  await createNotification(req.userId, { type: 'trade', title: `Sold ${sym}`, message: `You sold ${qty.toFixed(6)} ${sym} for $${netUSD.toFixed(2)}` });
  await sendTradeEmail(req.user, trade);
  res.status(201).json({ trade, message: `Sold ${qty.toFixed(8)} ${sym} for $${netUSD.toFixed(2)}` });
}

async function getHistory(req, res) {
  const { symbol, type, page = 1, limit = 20 } = req.query;
  const q = { userId: req.userId };
  if (symbol) q.symbol = symbol.toUpperCase();
  if (type) q.type = type;
  const total = await Trade.countDocuments(q);
  const trades = await Trade.find(q).sort({ createdAt: -1 }).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ trades, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
}

async function getStats(req, res) {
  const trades = await Trade.find({ userId: req.userId });
  if (!trades.length) return res.json({ totalTrades: 0, totalVolume: 0, totalFees: 0, bySymbol: {} });
  const totalVolume = trades.reduce((s,t) => s + (t.grossUSD||t.amountUSD||0), 0);
  const totalFees   = trades.reduce((s,t) => s + (t.fee||0), 0);
  const bySymbol = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { buys:0, sells:0, volume:0 };
    bySymbol[t.symbol][t.type==='buy'?'buys':'sells']++;
    bySymbol[t.symbol].volume += (t.grossUSD||t.amountUSD||0);
  }
  res.json({ totalTrades: trades.length, buys: trades.filter(t=>t.type==='buy').length, sells: trades.filter(t=>t.type==='sell').length, totalVolume: +totalVolume.toFixed(2), totalFees: +totalFees.toFixed(6), bySymbol });
}

async function getTrade(req, res) {
  const trade = await Trade.findOne({ _id: req.params.id, userId: req.userId });
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  res.json(trade);
}

module.exports = { buy, sell, getHistory, getStats, getTrade };
