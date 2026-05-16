const { getAllPrices, liveData, COINS } = require('../config/market');
const db = require('../config/database');

// ── GET /market/prices ────────────────────────────────────────
async function getPrices(req, res) {
  const prices = getAllPrices().map(enrich);
  res.json({ prices, count: prices.length, updatedAt: new Date().toISOString() });
}

// ── GET /market/prices/:symbol ────────────────────────────────
async function getPrice(req, res) {
  const sym  = req.params.symbol.toUpperCase();
  const coin = liveData[sym];
  if (!coin) return res.status(404).json({ error: `Symbol ${sym} not found` });
  const history = buildHistory(coin, 30);
  res.json({ ...enrich(coin), history });
}

// ── GET /market/search ────────────────────────────────────────
async function search(req, res) {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ results: [] });
  const results = getAllPrices()
    .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    .map(enrich);
  res.json({ results });
}

// ── GET /market/orderbook/:symbol ─────────────────────────────
async function getOrderBook(req, res) {
  const sym  = req.params.symbol.toUpperCase();
  const coin = liveData[sym];
  if (!coin) return res.status(404).json({ error: `Symbol ${sym} not found` });

  const spread = 0.0008;
  const levels = parseInt(req.query.levels) || 15;

  const asks = Array.from({ length: levels }, (_, i) => {
    const p = coin.price * (1 + spread * (i + 1));
    return { price: +p.toFixed(2), amount: +(Math.random() * 3 + 0.05).toFixed(6), total: 0 };
  });
  const bids = Array.from({ length: levels }, (_, i) => {
    const p = coin.price * (1 - spread * (i + 1));
    return { price: +p.toFixed(2), amount: +(Math.random() * 3 + 0.05).toFixed(6), total: 0 };
  });

  // Fill cumulative totals
  let cumA = 0, cumB = 0;
  asks.forEach(a => { cumA += a.amount; a.total = +cumA.toFixed(6); });
  bids.forEach(b => { cumB += b.amount; b.total = +cumB.toFixed(6); });

  res.json({
    symbol: sym, midPrice: coin.price,
    spread:  +((asks[0].price - bids[0].price)).toFixed(2),
    asks, bids,
    timestamp: new Date().toISOString(),
  });
}

// ── GET /market/trades/:symbol ────────────────────────────────
async function getRecentTrades(req, res) {
  const sym  = req.params.symbol.toUpperCase();
  const coin = liveData[sym];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });

  const count  = Math.min(parseInt(req.query.limit) || 25, 50);
  const trades = Array.from({ length: count }, (_, i) => {
    const side  = Math.random() > 0.5 ? 'buy' : 'sell';
    const price = +(coin.price * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2);
    return {
      id:        i,
      side,
      price,
      amount:    +(Math.random() * 1 + 0.001).toFixed(6),
      timestamp: new Date(Date.now() - i * 4000).toISOString(),
    };
  });
  res.json({ symbol: sym, trades });
}

// ── GET /market/chart/:symbol ─────────────────────────────────
async function getChartData(req, res) {
  const sym      = req.params.symbol.toUpperCase();
  const coin     = liveData[sym];
  if (!coin) return res.status(404).json({ error: 'Symbol not found' });

  const days     = Math.min(parseInt(req.query.days) || 30, 365);
  const interval = req.query.interval || 'daily';   // 'daily' | 'hourly'

  const candles  = interval === 'hourly'
    ? buildHourlyCandles(coin, Math.min(days * 24, 720))
    : buildHistory(coin, days);

  res.json({ symbol: sym, interval, candles });
}

// ── GET /market/gainers ───────────────────────────────────────
async function getGainers(req, res) {
  const all   = getAllPrices().filter(c => !c.stable);
  const top   = [...all].sort((a, b) => b.change24h - a.change24h).slice(0, 5).map(enrich);
  const worst = [...all].sort((a, b) => a.change24h - b.change24h).slice(0, 5).map(enrich);
  res.json({ gainers: top, losers: worst });
}

// ── Helpers ───────────────────────────────────────────────────
function enrich(coin) {
  const mc = coin.price * coin.circulatingSupply;
  return {
    symbol:             coin.symbol,
    name:               coin.name,
    price:              coin.price,
    change24h:          coin.change24h,
    high24h:            coin.high24h,
    low24h:             coin.low24h,
    volume24h:          coin.volume24h,
    marketCap:          +mc.toFixed(0),
    marketCapFormatted: formatLargeNum(mc),
    volumeFormatted:    formatLargeNum(coin.volume24h),
    lastUpdated:        coin.lastUpdated,
  };
}

function formatLargeNum(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M';
  return '$' + n.toLocaleString();
}

function buildHistory(coin, days) {
  const candles = [];
  let price     = coin.price * (1 - days * 0.001);
  const now     = Date.now();
  for (let i = days; i >= 0; i--) {
    const open  = price;
    const drift = (Math.random() - 0.48) * 0.03;
    const close = price * (1 + drift);
    const high  = Math.max(open, close) * (1 + Math.random() * 0.015);
    const low   = Math.min(open, close) * (1 - Math.random() * 0.015);
    candles.push({
      date:   new Date(now - i * 86400000).toISOString().split('T')[0],
      open:   +open.toFixed(2), high: +high.toFixed(2),
      low:    +low.toFixed(2),  close: +close.toFixed(2),
      volume: +((coin.volume24h || 1e6) * (0.7 + Math.random() * 0.6)).toFixed(0),
    });
    price = close;
  }
  if (candles.length) candles[candles.length - 1].close = coin.price;
  return candles;
}

function buildHourlyCandles(coin, hours) {
  const candles = [];
  let price     = coin.price * (1 - hours * 0.0003);
  const now     = Date.now();
  for (let i = hours; i >= 0; i--) {
    const open  = price;
    const drift = (Math.random() - 0.49) * 0.008;
    const close = price * (1 + drift);
    const high  = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low   = Math.min(open, close) * (1 - Math.random() * 0.005);
    candles.push({
      timestamp: new Date(now - i * 3600000).toISOString(),
      open: +open.toFixed(2), high: +high.toFixed(2),
      low:  +low.toFixed(2),  close: +close.toFixed(2),
    });
    price = close;
  }
  return candles;
}

module.exports = { getPrices, getPrice, search, getOrderBook, getRecentTrades, getChartData, getGainers };
