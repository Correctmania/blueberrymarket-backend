const db  = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { credit, debit } = require('../services/walletService');
const { createNotification } = require('../services/notificationService');

function auditLog(adminId, action, meta = {}) {
  db.get('admin_log').push({ id: uuidv4(), adminId, action, meta, createdAt: new Date().toISOString() }).write();
}

// ── GET /admin/dashboard ───────────────────────────────────────
async function getDashboard(req, res) {
  const users        = db.get('users').value();
  const trades       = db.get('trades').value();
  const transactions = db.get('transactions').value();
  const deposits     = transactions.filter(t => t.type === 'deposit');
  const withdrawals  = transactions.filter(t => t.type === 'withdrawal');
  const openTickets  = db.get('support').filter({ status: 'open' }).value();

  res.json({
    stats: {
      totalUsers:       users.length,
      activeUsers:      users.filter(u => !u.banned).length,
      kycVerified:      users.filter(u => u.kycVerified).length,
      kycPending:       users.filter(u => u.kycStatus === 'pending').length,
      totalTrades:      trades.length,
      totalDeposits:    deposits.length,
      totalWithdrawals: withdrawals.length,
      depositVolume:    +deposits.reduce((s, t) => s + (t.amount||0), 0).toFixed(2),
      withdrawalVolume: +withdrawals.reduce((s, t) => s + (t.amount||0), 0).toFixed(2),
      tradeVolume:      +trades.reduce((s, t) => s + (t.grossUSD || t.amountUSD||0), 0).toFixed(2),
      openTickets:      openTickets.length,
      referrals:        db.get('referrals').size().value(),
    },
    recentUsers:  db.get('users').sortBy('createdAt').reverse().take(5)
      .map(u => ({ id:u.id, username:u.username, email:u.email, createdAt:u.createdAt, kycStatus:u.kycStatus })).value(),
    recentTrades: db.get('trades').sortBy('createdAt').reverse().take(5).value(),
  });
}

// ── GET /admin/users ───────────────────────────────────────────
async function listUsers(req, res) {
  const { q, page = 1, limit = 20, kycStatus, banned } = req.query;
  let users = db.get('users').value();

  if (q) {
    const query = q.toLowerCase();
    users = users.filter(u => u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  }
  if (kycStatus) users = users.filter(u => u.kycStatus === kycStatus);
  if (banned !== undefined) users = users.filter(u => u.banned === (banned === 'true'));

  users = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total  = users.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const items  = users.slice(offset, offset + parseInt(limit)).map(u => {
    const { passwordHash, resetToken, resetTokenExpiry, twoFASecret, ...safe } = u;
    return safe;
  });

  res.json({ users: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
}

// ── GET /admin/users/:id ───────────────────────────────────────
async function getUser(req, res) {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const wallet  = db.get('wallets').find({ userId: user.id }).value();
  const trades  = db.get('trades').filter({ userId: user.id }).sortBy('createdAt').reverse().take(10).value();
  const txs     = db.get('transactions').filter({ userId: user.id }).sortBy('createdAt').reverse().take(10).value();
  const { passwordHash, resetToken, resetTokenExpiry, twoFASecret, ...safe } = user;
  res.json({ user: safe, wallet: wallet?.balances || {}, recentTrades: trades, recentTransactions: txs });
}

// ── POST /admin/users/:id/ban ──────────────────────────────────
async function banUser(req, res) {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.isAdmin) return res.status(400).json({ error: 'Cannot ban admin accounts' });
  user.banned    = true;
  user.updatedAt = new Date().toISOString();
  db.write();
  auditLog(req.userId, 'ban_user', { targetUserId: user.id, username: user.username });
  createNotification(user.id, { type: 'system', title: 'Account Suspended', message: 'Your account has been suspended. Please contact support.' });
  res.json({ message: `User ${user.username} banned` });
}

// ── POST /admin/users/:id/unban ────────────────────────────────
async function unbanUser(req, res) {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.banned    = false;
  user.updatedAt = new Date().toISOString();
  db.write();
  auditLog(req.userId, 'unban_user', { targetUserId: user.id });
  res.json({ message: `User ${user.username} unbanned` });
}

// ── POST /admin/users/:id/credit ──────────────────────────────
async function creditUser(req, res) {
  const { currency, amount, note } = req.body;
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const amt  = parseFloat(amount);
  if (!currency || !amt || amt <= 0) return res.status(422).json({ error: 'currency and amount required' });

  credit(req.params.id, currency.toUpperCase(), amt);
  const tx = {
    id: uuidv4(), userId: req.params.id, type: 'admin_credit', currency: currency.toUpperCase(),
    amount: amt, fee: 0, netAmount: amt, method: 'admin', status: 'completed',
    note: note || `Admin credit by ${req.user.username}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  db.get('transactions').push(tx).write();
  auditLog(req.userId, 'credit_user', { targetUserId: req.params.id, currency, amount: amt, note });
  createNotification(req.params.id, { type: 'deposit', title: 'Funds Credited', message: `${amt} ${currency.toUpperCase()} has been added to your account.` });
  res.json({ message: `Credited ${amt} ${currency} to ${user.username}`, transaction: tx });
}

// ── POST /admin/users/:id/deduct ──────────────────────────────
async function deductUser(req, res) {
  const { currency, amount, note } = req.body;
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const amt = parseFloat(amount);
  try {
    debit(req.params.id, currency.toUpperCase(), amt);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const tx = {
    id: uuidv4(), userId: req.params.id, type: 'admin_deduct', currency: currency.toUpperCase(),
    amount: amt, fee: 0, netAmount: amt, method: 'admin', status: 'completed',
    note: note || `Admin deduct by ${req.user.username}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  db.get('transactions').push(tx).write();
  auditLog(req.userId, 'deduct_user', { targetUserId: req.params.id, currency, amount: amt });
  res.json({ message: `Deducted ${amt} ${currency} from ${user.username}` });
}

// ── POST /admin/kyc/:id/approve ────────────────────────────────
async function approveKyc(req, res) {
  const record = db.get('kyc').find({ id: req.params.id }).value();
  if (!record) return res.status(404).json({ error: 'KYC record not found' });
  record.status     = 'verified';
  record.reviewedAt = new Date().toISOString();
  db.write();
  const user = db.get('users').find({ id: record.userId }).value();
  if (user) { user.kycVerified = true; user.kycStatus = 'verified'; user.updatedAt = new Date().toISOString(); db.write(); }
  auditLog(req.userId, 'approve_kyc', { kycId: req.params.id, userId: record.userId });
  createNotification(record.userId, { type: 'kyc', title: 'KYC Approved ✅', message: 'Your identity has been verified. All features unlocked.' });
  res.json({ message: 'KYC approved' });
}

// ── POST /admin/kyc/:id/reject ─────────────────────────────────
async function rejectKyc(req, res) {
  const { reason } = req.body;
  const record = db.get('kyc').find({ id: req.params.id }).value();
  if (!record) return res.status(404).json({ error: 'KYC record not found' });
  record.status       = 'rejected';
  record.reviewedAt   = new Date().toISOString();
  record.reviewerNote = reason || 'Documents could not be verified';
  db.write();
  const user = db.get('users').find({ id: record.userId }).value();
  if (user) { user.kycStatus = 'rejected'; user.updatedAt = new Date().toISOString(); db.write(); }
  auditLog(req.userId, 'reject_kyc', { kycId: req.params.id, reason });
  createNotification(record.userId, { type: 'kyc', title: 'KYC Rejected', message: `Your KYC was rejected: ${record.reviewerNote}. Please resubmit.` });
  res.json({ message: 'KYC rejected' });
}

// ── GET /admin/kyc/pending ─────────────────────────────────────
async function listPendingKyc(req, res) {
  const pending = db.get('kyc').filter({ status: 'pending' }).sortBy('submittedAt').value();
  res.json({ pending, count: pending.length });
}

// ── GET /admin/transactions ────────────────────────────────────
async function listTransactions(req, res) {
  const { type, status, page = 1, limit = 30 } = req.query;
  let txs = db.get('transactions').value();
  if (type)   txs = txs.filter(t => t.type === type);
  if (status) txs = txs.filter(t => t.status === status);
  txs = txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total  = txs.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  res.json({ transactions: txs.slice(offset, offset + parseInt(limit)), total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
}

// ── POST /admin/transactions/:id/approve ──────────────────────
async function approveTransaction(req, res) {
  const tx = db.get('transactions').find({ id: req.params.id }).value();
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  tx.status    = 'completed';
  tx.updatedAt = new Date().toISOString();
  db.write();
  auditLog(req.userId, 'approve_transaction', { txId: req.params.id });
  createNotification(tx.userId, { type: tx.type, title: 'Transaction Approved', message: `Your ${tx.type} of ${tx.amount} ${tx.currency} has been approved.` });
  res.json({ message: 'Transaction approved', transaction: tx });
}

// ── POST /admin/transactions/:id/reject ───────────────────────
async function rejectTransaction(req, res) {
  const { reason } = req.body;
  const tx = db.get('transactions').find({ id: req.params.id }).value();
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Only pending transactions can be rejected' });

  // Refund for withdrawals
  if (tx.type === 'withdrawal') credit(tx.userId, tx.currency, tx.amount);

  tx.status    = 'rejected';
  tx.note      = reason || 'Rejected by admin';
  tx.updatedAt = new Date().toISOString();
  db.write();
  auditLog(req.userId, 'reject_transaction', { txId: req.params.id, reason });
  createNotification(tx.userId, { type: 'system', title: 'Transaction Rejected', message: `Your ${tx.type} was rejected. ${tx.note}` });
  res.json({ message: 'Transaction rejected' });
}

// ── GET /admin/support ─────────────────────────────────────────
async function listTickets(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  let q = db.get('support').value();
  if (status) q = q.filter(t => t.status === status);
  q = q.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total  = q.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  res.json({ tickets: q.slice(offset, offset + parseInt(limit)), total });
}

// ── POST /admin/support/:id/reply ─────────────────────────────
async function replyTicket(req, res) {
  const { message, status } = req.body;
  if (!message) return res.status(422).json({ error: 'message required' });
  const ticket = db.get('support').find({ id: req.params.id }).value();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  ticket.replies.push({ from: 'admin', adminId: req.userId, message, createdAt: new Date().toISOString() });
  if (status) ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  db.write();
  createNotification(ticket.userId, { type: 'system', title: 'Support Reply', message: `Support has replied to your ticket: "${ticket.subject}"` });
  res.json({ ticket });
}

// ── GET /admin/audit-log ───────────────────────────────────────
async function getAuditLog(req, res) {
  const logs = db.get('admin_log').sortBy('createdAt').reverse().take(100).value();
  res.json({ logs });
}

module.exports = {
  getDashboard, listUsers, getUser, banUser, unbanUser, creditUser, deductUser,
  approveKyc, rejectKyc, listPendingKyc,
  listTransactions, approveTransaction, rejectTransaction,
  listTickets, replyTicket, getAuditLog,
};
