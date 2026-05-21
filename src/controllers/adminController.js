const { User, Wallet, Trade, Transaction, Referral, Kyc, Support, AdminLog } = require('../models');
const { credit, debit } = require('../services/walletService');
const { createNotification } = require('../services/notificationService');

async function auditLog(adminId, action, meta = {}) {
  await AdminLog.create({ adminId, action, meta });
}

async function getDashboard(req, res) {
  const [totalUsers, bannedUsers, kycVerified, kycPending, totalTrades, allTx, openTickets, referrals] = await Promise.all([
    User.countDocuments(), User.countDocuments({ banned: true }),
    User.countDocuments({ kycVerified: true }), User.countDocuments({ kycStatus: 'pending' }),
    Trade.countDocuments(), Transaction.find(),
    Support.countDocuments({ status: 'open' }), Referral.countDocuments(),
  ]);
  const deposits    = allTx.filter(t => t.type === 'deposit');
  const withdrawals = allTx.filter(t => t.type === 'withdrawal');
  const trades      = await Trade.find().sort({ createdAt: -1 }).limit(5);
  const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('username email kycStatus createdAt');
  res.json({
    stats: { totalUsers, activeUsers: totalUsers - bannedUsers, kycVerified, kycPending, totalTrades, totalDeposits: deposits.length, totalWithdrawals: withdrawals.length, depositVolume: +deposits.reduce((s,t)=>s+(t.amount||0),0).toFixed(2), withdrawalVolume: +withdrawals.reduce((s,t)=>s+(t.amount||0),0).toFixed(2), tradeVolume: +(await Trade.find()).reduce((s,t)=>s+(t.grossUSD||t.amountUSD||0),0).toFixed(2), openTickets, referrals },
    recentUsers, recentTrades: trades,
  });
}

async function listUsers(req, res) {
  const { q, page = 1, limit = 20, kycStatus, banned } = req.query;
  const query = {};
  if (q) query.$or = [{ username: new RegExp(q,'i') }, { email: new RegExp(q,'i') }];
  if (kycStatus) query.kycStatus = kycStatus;
  if (banned !== undefined) query.banned = banned === 'true';
  const total = await User.countDocuments(query);
  const users = await User.find(query).select('-passwordHash -resetToken -twoFASecret').sort({ createdAt: -1 }).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
}

async function getUser(req, res) {
  const user = await User.findById(req.params.id).select('-passwordHash -resetToken -twoFASecret');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const wallet = await Wallet.findOne({ userId: req.params.id });
  const trades = await Trade.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(10);
  const txs    = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(10);
  res.json({ user, wallet: wallet?.balances || {}, recentTrades: trades, recentTransactions: txs });
}

async function banUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.isAdmin) return res.status(400).json({ error: 'Cannot ban admin' });
  await User.findByIdAndUpdate(req.params.id, { banned: true });
  await auditLog(req.userId, 'ban_user', { targetUserId: req.params.id, username: user.username });
  await createNotification(req.params.id, { type: 'system', title: 'Account Suspended', message: 'Your account has been suspended. Contact support.' });
  res.json({ message: `User ${user.username} banned` });
}

async function unbanUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await User.findByIdAndUpdate(req.params.id, { banned: false });
  await auditLog(req.userId, 'unban_user', { targetUserId: req.params.id });
  res.json({ message: `User ${user.username} unbanned` });
}

async function creditUser(req, res) {
  const { currency, amount, note } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const amt = parseFloat(amount);
  if (!currency || !amt || amt <= 0) return res.status(422).json({ error: 'currency and amount required' });
  await credit(req.params.id, currency.toUpperCase(), amt);
  const tx = await Transaction.create({ userId: req.params.id, type: 'admin_credit', currency: currency.toUpperCase(), amount: amt, fee: 0, netAmount: amt, method: 'admin', status: 'completed', note: note || `Admin credit by ${req.user.username}` });
  await auditLog(req.userId, 'credit_user', { targetUserId: req.params.id, currency, amount: amt, note });
  await createNotification(req.params.id, { type: 'deposit', title: 'Funds Credited', message: `${amt} ${currency.toUpperCase()} has been added to your account.` });
  res.json({ message: `Credited ${amt} ${currency} to ${user.username}`, transaction: tx });
}

async function deductUser(req, res) {
  const { currency, amount, note } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const amt = parseFloat(amount);
  try { await debit(req.params.id, currency.toUpperCase(), amt); } catch(e) { return res.status(400).json({ error: e.message }); }
  await Transaction.create({ userId: req.params.id, type: 'admin_deduct', currency: currency.toUpperCase(), amount: amt, fee: 0, netAmount: amt, method: 'admin', status: 'completed', note: note || `Admin deduct` });
  await auditLog(req.userId, 'deduct_user', { targetUserId: req.params.id, currency, amount: amt });
  res.json({ message: `Deducted ${amt} ${currency} from ${user.username}` });
}

async function listPendingKyc(req, res) {
  const pending = await Kyc.find({ status: 'pending' }).sort({ createdAt: 1 });
  res.json({ pending, count: pending.length });
}

async function approveKyc(req, res) {
  const record = await Kyc.findById(req.params.id);
  if (!record) return res.status(404).json({ error: 'KYC record not found' });
  await Kyc.findByIdAndUpdate(req.params.id, { status: 'verified', reviewedAt: new Date() });
  await User.findByIdAndUpdate(record.userId, { kycVerified: true, kycStatus: 'verified' });
  await auditLog(req.userId, 'approve_kyc', { kycId: req.params.id });
  await createNotification(record.userId, { type: 'kyc', title: 'KYC Approved ✅', message: 'Your identity has been verified. All features unlocked.' });
  res.json({ message: 'KYC approved' });
}

async function rejectKyc(req, res) {
  const { reason } = req.body;
  const record = await Kyc.findById(req.params.id);
  if (!record) return res.status(404).json({ error: 'KYC record not found' });
  await Kyc.findByIdAndUpdate(req.params.id, { status: 'rejected', reviewedAt: new Date(), reviewerNote: reason || 'Documents could not be verified' });
  await User.findByIdAndUpdate(record.userId, { kycStatus: 'rejected' });
  await auditLog(req.userId, 'reject_kyc', { kycId: req.params.id, reason });
  await createNotification(record.userId, { type: 'kyc', title: 'KYC Rejected', message: `Your KYC was rejected: ${reason}. Please resubmit.` });
  res.json({ message: 'KYC rejected' });
}

async function listTransactions(req, res) {
  const { type, status, page = 1, limit = 30 } = req.query;
  const q = {};
  if (type) q.type = type;
  if (status) q.status = status;
  const total = await Transaction.countDocuments(q);
  const transactions = await Transaction.find(q).sort({ createdAt: -1 }).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ transactions, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
}

async function approveTransaction(req, res) {
  const tx = await Transaction.findByIdAndUpdate(req.params.id, { status: 'completed' }, { new: true });
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  await auditLog(req.userId, 'approve_transaction', { txId: req.params.id });
  await createNotification(tx.userId, { type: tx.type, title: 'Transaction Approved', message: `Your ${tx.type} of ${tx.amount} ${tx.currency} has been approved.` });
  res.json({ message: 'Transaction approved', transaction: tx });
}

async function rejectTransaction(req, res) {
  const { reason } = req.body;
  const tx = await Transaction.findById(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Only pending transactions can be rejected' });
  if (tx.type === 'withdrawal') await credit(tx.userId, tx.currency, tx.amount);
  await Transaction.findByIdAndUpdate(req.params.id, { status: 'rejected', note: reason || 'Rejected by admin' });
  await auditLog(req.userId, 'reject_transaction', { txId: req.params.id, reason });
  await createNotification(tx.userId, { type: 'system', title: 'Transaction Rejected', message: `Your ${tx.type} was rejected. ${reason || ''}` });
  res.json({ message: 'Transaction rejected' });
}

async function listTickets(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const q = {};
  if (status) q.status = status;
  const total = await Support.countDocuments(q);
  const tickets = await Support.find(q).sort({ createdAt: -1 }).skip((parseInt(page)-1)*parseInt(limit)).limit(parseInt(limit));
  res.json({ tickets, total });
}

async function replyTicket(req, res) {
  const { message, status } = req.body;
  if (!message) return res.status(422).json({ error: 'message required' });
  const ticket = await Support.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  ticket.replies.push({ from: 'admin', adminId: req.userId, message, createdAt: new Date() });
  if (status) ticket.status = status;
  await ticket.save();
  await createNotification(ticket.userId, { type: 'system', title: 'Support Reply', message: `Support replied to your ticket: "${ticket.subject}"` });
  res.json({ ticket });
}

async function getAuditLog(req, res) {
  const logs = await AdminLog.find().sort({ createdAt: -1 }).limit(100);
  res.json({ logs });
}

module.exports = { getDashboard, listUsers, getUser, banUser, unbanUser, creditUser, deductUser, listPendingKyc, approveKyc, rejectKyc, listTransactions, approveTransaction, rejectTransaction, listTickets, replyTicket, getAuditLog };
