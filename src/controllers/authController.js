const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { User, Session, Referral } = require('../models');
const { issueTokens, verifyRefreshToken } = require('../middleware/auth');
const { credit } = require('../services/walletService');
const { createNotification } = require('../services/notificationService');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');
const REFERRAL_BONUS = parseFloat(process.env.REFERRAL_BONUS_USD) || 10;

async function register(req, res) {
  const { username, email, password, referralCode } = req.body;
  const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
  if (exists) {
    const field = exists.email === email.toLowerCase() ? 'email' : 'username';
    return res.status(409).json({ error: `This ${field} is already taken` });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const myCode = 'BB' + Math.random().toString(36).slice(2, 8).toUpperCase();
  let referrerId = null;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (referrer) referrerId = referrer._id.toString();
  }
  const user = await User.create({
    username: username.trim(), email: email.toLowerCase().trim(),
    passwordHash, referralCode: myCode, referredBy: referrerId,
  });
  const userId = user._id.toString();
  await credit(userId, 'USD', 1000);
  if (referrerId) {
    await credit(referrerId, 'USD', REFERRAL_BONUS);
    await credit(userId, 'USD', REFERRAL_BONUS);
    await Referral.create({ referrerId, referredId: userId, bonus: REFERRAL_BONUS });
    await createNotification(referrerId, { type: 'referral', title: 'Referral Bonus!', message: `${username} joined using your code. You earned $${REFERRAL_BONUS}!` });
  }
  await createNotification(userId, { type: 'system', title: 'Welcome to BlueberryMarket! 🫐', message: 'Your account is ready. Start trading!' });
  await sendWelcomeEmail(user);
  const tokens = issueTokens(userId);
  const safe = user.toObject(); delete safe.passwordHash; delete safe.resetToken; delete safe.twoFASecret;
  res.status(201).json({ ...tokens, user: safe });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.banned) return res.status(403).json({ error: 'Account suspended. Contact support.' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
  user.loginCount = (user.loginCount || 0) + 1;
  user.lastLogin = new Date();
  await user.save();
  const tokens = issueTokens(user._id.toString());
  const safe = user.toObject(); delete safe.passwordHash; delete safe.resetToken; delete safe.twoFASecret;
  res.json({ ...tokens, user: safe });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired refresh token' });
  const tokens = issueTokens(payload.userId);
  res.json(tokens);
}

async function logout(req, res) {
  await Session.deleteMany({ userId: req.userId });
  res.json({ message: 'Logged out successfully' });
}

async function getMe(req, res) {
  const user = await User.findById(req.userId).select('-passwordHash -resetToken -twoFASecret');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}

async function updateProfile(req, res) {
  const { username } = req.body;
  const user = await User.findById(req.userId);
  if (username && username !== user.username) {
    const taken = await User.findOne({ username });
    if (taken) return res.status(409).json({ error: 'Username already taken' });
    user.username = username.trim();
  }
  await user.save();
  const safe = user.toObject(); delete safe.passwordHash;
  res.json(safe);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.userId);
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  await Session.deleteMany({ userId: req.userId });
  res.json({ message: 'Password changed. Please log in again.' });
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetToken = code;
  user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();
  await sendPasswordResetEmail(user, code);
  res.json({ message: 'If that email exists, a reset code has been sent.' });
}

async function resetPassword(req, res) {
  const { email, code, newPassword } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || user.resetToken !== code || new Date() > new Date(user.resetTokenExpiry))
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetToken = null; user.resetTokenExpiry = null;
  await user.save();
  await Session.deleteMany({ userId: user._id.toString() });
  res.json({ message: 'Password reset successfully. Please log in.' });
}

module.exports = { register, login, refresh, logout, getMe, updateProfile, changePassword, forgotPassword, resetPassword };
