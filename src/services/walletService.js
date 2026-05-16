const db       = require('../config/database');
const { getPrice, COINS } = require('../config/market');
const { v4: uuidv4 } = require('uuid');

// ── Get or create wallet ──────────────────────────────────────
function getWallet(userId) {
  let wallet = db.get('wallets').find({ userId }).value();
  if (!wallet) {
    wallet = {
      id: uuidv4(), userId,
      balances: buildEmptyBalances(),
      updatedAt: new Date().toISOString(),
    };
    db.get('wallets').push(wallet).write();
  }
  return wallet;
}

function buildEmptyBalances() {
  const b = { USD: 0 };
  for (const sym of Object.keys(COINS)) b[sym] = 0;
  return b;
}

// ── Credit / debit helpers ────────────────────────────────────
function credit(userId, currency, amount) {
  const wallet = getWallet(userId);
  wallet.balances[currency] = parseFloat(((wallet.balances[currency] || 0) + amount).toFixed(10));
  wallet.updatedAt = new Date().toISOString();
  db.write();
  return wallet.balances[currency];
}

function debit(userId, currency, amount) {
  const wallet = getWallet(userId);
  const current = wallet.balances[currency] || 0;
  if (current < amount) throw Object.assign(new Error('Insufficient balance'), { status: 400 });
  wallet.balances[currency] = parseFloat((current - amount).toFixed(10));
  wallet.updatedAt = new Date().toISOString();
  db.write();
  return wallet.balances[currency];
}

// ── Portfolio value in USD ────────────────────────────────────
function portfolioValueUSD(userId) {
  const wallet = getWallet(userId);
  let total = wallet.balances.USD || 0;
  for (const [sym, amt] of Object.entries(wallet.balances)) {
    if (sym === 'USD' || !amt) continue;
    const price = getPrice(sym);
    if (price) total += amt * price;
  }
  return parseFloat(total.toFixed(2));
}

// ── Formatted portfolio with USD values ──────────────────────
function getPortfolio(userId) {
  const wallet = getWallet(userId);
  const assets = [];
  for (const [sym, amt] of Object.entries(wallet.balances)) {
    const price = sym === 'USD' ? 1 : (getPrice(sym) || 0);
    const usdValue = parseFloat((amt * price).toFixed(2));
    assets.push({ symbol: sym, amount: amt, priceUSD: price, valueUSD: usdValue });
  }
  assets.sort((a, b) => b.valueUSD - a.valueUSD);
  const totalUSD = assets.reduce((s, a) => s + a.valueUSD, 0);
  return { assets, totalUSD: parseFloat(totalUSD.toFixed(2)) };
}

module.exports = { getWallet, credit, debit, portfolioValueUSD, getPortfolio };
