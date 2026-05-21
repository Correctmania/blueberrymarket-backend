const { Wallet } = require('../models');
const { getPrice, COINS } = require('../config/market');

async function getWallet(userId) {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) wallet = await Wallet.create({ userId, balances: buildEmptyBalances() });
  return wallet;
}

function buildEmptyBalances() {
  const b = { USD: 0 };
  for (const sym of Object.keys(COINS)) b[sym] = 0;
  return b;
}

async function credit(userId, currency, amount) {
  const wallet = await getWallet(userId);
  wallet.balances[currency] = parseFloat(((wallet.balances[currency] || 0) + amount).toFixed(10));
  wallet.markModified('balances');
  await wallet.save();
  return wallet.balances[currency];
}

async function debit(userId, currency, amount) {
  const wallet = await getWallet(userId);
  const current = wallet.balances[currency] || 0;
  if (current < amount) throw Object.assign(new Error('Insufficient balance'), { status: 400 });
  wallet.balances[currency] = parseFloat((current - amount).toFixed(10));
  wallet.markModified('balances');
  await wallet.save();
  return wallet.balances[currency];
}

async function getPortfolio(userId) {
  const wallet = await getWallet(userId);
  const balObj = wallet.balances.toObject ? wallet.balances.toObject() : wallet.balances;
  const assets = [];
  for (const [sym, amt] of Object.entries(balObj)) {
    const price = sym === 'USD' ? 1 : (getPrice(sym) || 0);
    const usdValue = parseFloat((amt * price).toFixed(2));
    assets.push({ symbol: sym, amount: amt, priceUSD: price, valueUSD: usdValue });
  }
  assets.sort((a, b) => b.valueUSD - a.valueUSD);
  const totalUSD = assets.reduce((s, a) => s + a.valueUSD, 0);
  return { assets, totalUSD: parseFloat(totalUSD.toFixed(2)) };
}

module.exports = { getWallet, credit, debit, getPortfolio };
