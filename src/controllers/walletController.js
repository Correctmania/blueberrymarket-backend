const { Transaction } = require('../models');
const { getWallet, credit, debit, getPortfolio } = require('../services/walletService');
const { COINS } = require('../config/market');
const { createNotification } = require('../services/notificationService');
const { sendDepositEmail, sendWithdrawEmail } = require('../services/emailService');

const MIN_DEPOSIT_USD = parseFloat(process.env.MIN_DEPOSIT_USD) || 10;
const MIN_WITHDRAWAL_USD = parseFloat(process.env.MIN_WITHDRAWAL_USD) || 20;
const WITHDRAWAL_FEE_USD = parseFloat(process.env.WITHDRAWAL_FEE_USD) || 2.50;
const VALID_CURRENCIES = ['USD', ...Object.keys(COINS)];

async function getBalance(req, res) {
  const portfolio = await getPortfolio(req.userId);
  res.json(portfolio);
}

async function getDepositAddress(req, res) {
  const { currency } = req.query;
  if (!currency || !VALID_CURRENCIES.includes(currency.toUpperCase()))
    return res.status(400).json({ error: 'Invalid currency' });
  const id = req.userId.replace(/-/g,'');
  const addresses = {
    BTC: `bc1q${id.slice(0,32)}`, ETH: `0x${id.slice(0,40)}`,
    USDT: `0x${id.slice(0,40)}`, USDC: `0x${id.slice(0,40)}`,
    BNB: `bnb${id.slice(0,38)}`, SOL: id.slice(0,44),
    USD: 'Use bank transfer',
  };
  res.json({ currency: currency.toUpperCase(), address: addresses[currency.toUpperCase()] || `${currency}_${id.slice(0,12)}` });
}

async function deposit(req, res) {
  const { currency, amount, method, txHash } = req.body;
  const cur = currency?.toUpperCase();
  const amt = parseFloat(amount);
  if (!cur || !VALID_CURRENCIES.includes(cur)) return res.status(400).json({ error: 'Invalid currency' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (cur === 'USD' && amt < MIN_DEPOSIT_USD) return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT_USD}` });
  const tx = await Transaction.create({ userId: req.userId, type: 'deposit', currency: cur, amount: amt, fee: 0, netAmount: amt, method: method || 'bank_transfer', txHash: txHash || null, status: 'completed' });
  await credit(req.userId, cur, amt);
  await createNotification(req.userId, { type: 'deposit', title: 'Deposit Received', message: `${amt} ${cur} has been credited to your wallet.` });
  await sendDepositEmail(req.user, tx);
  res.status(201).json({ transaction: tx, message: `${amt} ${cur} credited to your account` });
}

async function withdraw(req, res) {
  const { currency, amount, address, network, memo } = req.body;
  const cur = currency?.toUpperCase();
  const amt = parseFloat(amount);
  if (!cur || !VALID_CURRENCIES.includes(cur)) return res.status(400).json({ error: 'Invalid currency' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive' });
  if (!address) return res.status(400).json({ error: 'Withdrawal address required' });
  let fee, netAmount;
  if (cur === 'USD') {
    if (amt < MIN_WITHDRAWAL_USD) return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}` });
    fee = WITHDRAWAL_FEE_USD; netAmount = amt - fee;
  } else { fee = amt * 0.001; netAmount = amt - fee; }
  if (netAmount <= 0) return res.status(400).json({ error: 'Amount too small after fees' });
  try { await debit(req.userId, cur, amt); } catch (e) { return res.status(400).json({ error: e.message }); }
  const tx = await Transaction.create({ userId: req.userId, type: 'withdrawal', currency: cur, amount: amt, fee: parseFloat(fee.toFixed(8)), netAmount: parseFloat(netAmount.toFixed(8)), address, network: network || cur, memo: memo || null, status: 'pending' });
  setTimeout(async () => { await Transaction.findByIdAndUpdate(tx._id, { status: 'completed' }); }, 10000);
  await createNotification(req.userId, { type: 'withdrawal', title: 'Withdrawal Submitted', message: `Your withdrawal of ${amt} ${cur} is being processed.` });
  await sendWithdrawEmail(req.user, tx);
  res.status(201).json({ transaction: tx, message: 'Withdrawal submitted and is being processed' });
}

async function getTransactions(req, res) {
  const { type, currency, status, page = 1, limit = 20 } = req.query;
  const q = { userId: req.userId };
  if (type) q.type = type;
  if (currency) q.currency = currency.toUpperCase();
  if (status) q.status = status;
  const total = await Transaction.countDocuments(q);
  const items = await Transaction.find(q).sort({ createdAt: -1 }).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ transactions: items, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
}

async function getTransaction(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, userId: req.userId });
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
}

module.exports = { getBalance, getDepositAddress, deposit, withdraw, getTransactions, getTransaction };
