const { v4: uuidv4 }  = require('uuid');
const db              = require('../config/database');
const { getWallet, credit, debit, getPortfolio } = require('../services/walletService');
const { COINS }       = require('../config/market');
const { createNotification } = require('../services/notificationService');
const { sendDepositEmail, sendWithdrawEmail } = require('../services/emailService');

const MIN_DEPOSIT_USD    = parseFloat(process.env.MIN_DEPOSIT_USD)    || 10;
const MIN_WITHDRAWAL_USD = parseFloat(process.env.MIN_WITHDRAWAL_USD) || 20;
const WITHDRAWAL_FEE_USD = parseFloat(process.env.WITHDRAWAL_FEE_USD) || 2.50;

const VALID_CURRENCIES = ['USD', ...Object.keys(COINS)];

// ── GET /wallet/balance ──────────────────────────────────────
async function getBalance(req, res) {
  const portfolio = getPortfolio(req.userId);
  res.json(portfolio);
}

// ── GET /wallet/address ───────────────────────────────────────
async function getDepositAddress(req, res) {
  const { currency } = req.query;
  if (!currency || !VALID_CURRENCIES.includes(currency.toUpperCase()))
    return res.status(400).json({ error: 'Invalid currency' });

  // In production this would call a real blockchain API
  const addresses = {
    BTC:  `bc1q${req.userId.replace(/-/g,'').slice(0,32)}`,
    ETH:  `0x${req.userId.replace(/-/g,'').slice(0,40)}`,
    USDT: `0x${req.userId.replace(/-/g,'').slice(0,40)}`,
    USDC: `0x${req.userId.replace(/-/g,'').slice(0,40)}`,
    BNB:  `bnb${req.userId.replace(/-/g,'').slice(0,38)}`,
    SOL:  req.userId.replace(/-/g,'').slice(0,44),
    USD:  'Use bank transfer — see payment details below',
  };

  res.json({
    currency: currency.toUpperCase(),
    address:  addresses[currency.toUpperCase()] || `${currency.toUpperCase()}_address_${req.userId.slice(0,12)}`,
    qrCode:   `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${addresses[currency.toUpperCase()] || ''}`,
    network:  getNetwork(currency.toUpperCase()),
    memo:     currency.toUpperCase() === 'XRP' ? Math.floor(Math.random()*1e9).toString() : null,
  });
}

function getNetwork(sym) {
  const nets = { BTC: 'Bitcoin', ETH: 'ERC-20', BNB: 'BEP-20', SOL: 'Solana', ADA: 'Cardano', USDT: 'ERC-20 / TRC-20', USDC: 'ERC-20', USD: 'Bank Transfer' };
  return nets[sym] || sym;
}

// ── POST /wallet/deposit ───────────────────────────────────────
async function deposit(req, res) {
  const { currency, amount, method, txHash } = req.body;
  const cur = currency?.toUpperCase();
  const amt = parseFloat(amount);

  if (!cur || !VALID_CURRENCIES.includes(cur))
    return res.status(400).json({ error: 'Invalid currency' });
  if (!amt || amt <= 0)
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (cur === 'USD' && amt < MIN_DEPOSIT_USD)
    return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT_USD}` });

  const tx = {
    id:        uuidv4(),
    userId:    req.userId,
    type:      'deposit',
    currency:  cur,
    amount:    amt,
    fee:       0,
    netAmount: amt,
    method:    method || 'bank_transfer',
    txHash:    txHash || null,
    status:    'completed',   // In production: 'pending' until blockchain confirms
    note:      '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.get('transactions').push(tx).write();
  credit(req.userId, cur, amt);

  createNotification(req.userId, {
    type: 'deposit', title: 'Deposit Received',
    message: `${amt} ${cur} has been credited to your wallet.`,
    meta: { txId: tx.id, currency: cur, amount: amt },
  });

  await sendDepositEmail(req.user, tx);
  res.status(201).json({ transaction: tx, message: `${amt} ${cur} credited to your account` });
}

// ── POST /wallet/withdraw ──────────────────────────────────────
async function withdraw(req, res) {
  const { currency, amount, address, network, memo } = req.body;
  const cur = currency?.toUpperCase();
  const amt = parseFloat(amount);

  if (!cur || !VALID_CURRENCIES.includes(cur))
    return res.status(400).json({ error: 'Invalid currency' });
  if (!amt || amt <= 0)
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!address)
    return res.status(400).json({ error: 'Withdrawal address / account required' });

  // Fee logic
  let fee, netAmount;
  if (cur === 'USD') {
    if (amt < MIN_WITHDRAWAL_USD) return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}` });
    fee = WITHDRAWAL_FEE_USD;
    netAmount = amt - fee;
  } else {
    fee       = amt * 0.001;           // 0.1% crypto withdrawal fee
    netAmount = amt - fee;
  }
  if (netAmount <= 0) return res.status(400).json({ error: 'Amount too small to cover withdrawal fee' });

  // Debit (throws if insufficient)
  try { debit(req.userId, cur, amt); } catch (e) { return res.status(400).json({ error: e.message }); }

  const tx = {
    id:        uuidv4(),
    userId:    req.userId,
    type:      'withdrawal',
    currency:  cur,
    amount:    amt,
    fee:       parseFloat(fee.toFixed(8)),
    netAmount: parseFloat(netAmount.toFixed(8)),
    address,
    network:   network || getNetwork(cur),
    memo:      memo || null,
    status:    'pending',
    note:      '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.get('transactions').push(tx).write();

  // Simulate processing after 10 seconds (in production: real blockchain tx)
  setTimeout(() => {
    const t = db.get('transactions').find({ id: tx.id }).value();
    if (t) { t.status = 'completed'; t.updatedAt = new Date().toISOString(); db.write(); }
  }, 10000);

  createNotification(req.userId, {
    type: 'withdrawal', title: 'Withdrawal Submitted',
    message: `Your withdrawal of ${amt} ${cur} is being processed.`,
    meta: { txId: tx.id },
  });

  await sendWithdrawEmail(req.user, tx);
  res.status(201).json({ transaction: tx, message: 'Withdrawal submitted and is being processed' });
}

// ── GET /wallet/transactions ───────────────────────────────────
async function getTransactions(req, res) {
  const { type, currency, status, page = 1, limit = 20 } = req.query;
  let q = db.get('transactions').filter({ userId: req.userId });
  if (type)     q = q.filter({ type });
  if (currency) q = q.filter({ currency: currency.toUpperCase() });
  if (status)   q = q.filter({ status });

  const all    = q.sortBy('createdAt').reverse().value();
  const total  = all.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const items  = all.slice(offset, offset + parseInt(limit));

  res.json({ transactions: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
}

// ── GET /wallet/transaction/:id ────────────────────────────────
async function getTransaction(req, res) {
  const tx = db.get('transactions').find({ id: req.params.id, userId: req.userId }).value();
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
}

module.exports = { getBalance, getDepositAddress, deposit, withdraw, getTransactions, getTransaction };
