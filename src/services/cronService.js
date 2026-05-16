const cron = require('node-cron');
const db   = require('../config/database');
const { liveData } = require('../config/market');

function startCronJobs() {
  // ── Save hourly price snapshots ──────────────────────────────
  cron.schedule('0 * * * *', () => {
    const snapshot = {};
    for (const [sym, coin] of Object.entries(liveData)) {
      if (!snapshot[sym]) snapshot[sym] = [];
      snapshot[sym] = {
        price:     coin.price,
        change24h: coin.change24h,
        high24h:   coin.high24h,
        low24h:    coin.low24h,
        volume24h: coin.volume24h,
        ts:        new Date().toISOString(),
      };
    }
    const history = db.get('price_history').value() || {};
    for (const [sym, snap] of Object.entries(snapshot)) {
      if (!history[sym]) history[sym] = [];
      history[sym].push(snap);
      // Keep only last 30 days of hourly data
      if (history[sym].length > 720) history[sym] = history[sym].slice(-720);
    }
    db.set('price_history', history).write();
    console.log('[CRON] Hourly price snapshot saved');
  });

  // ── Clean expired sessions daily ─────────────────────────────
  cron.schedule('0 2 * * *', () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const before = db.get('sessions').size().value();
    db.get('sessions').remove(s => s.createdAt < cutoff).write();
    const after = db.get('sessions').size().value();
    if (before !== after) console.log(`[CRON] Removed ${before - after} expired sessions`);
  });

  // ── Auto-complete stuck pending transactions (15min) ─────────
  cron.schedule('*/15 * * * *', () => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let count = 0;
    db.get('transactions')
      .filter(t => t.status === 'pending' && t.createdAt < cutoff)
      .each(t => { t.status = 'completed'; t.updatedAt = new Date().toISOString(); count++; })
      .write();
    if (count > 0) console.log(`[CRON] Auto-completed ${count} pending transactions`);
  });

  console.log('[CRON] Scheduled jobs started');
}

module.exports = { startCronJobs };
