const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db       = require('../config/database');
const { issueTokens, verifyRefreshToken } = require('../middleware/auth');
const { credit }  = require('../services/walletService');
const { createNotification } = require('../services/notificationService');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');
const REFERRAL_BONUS = parseFloat(process.env.REFERRAL_BONUS_USD) || 10;

// ── Register ──────────────────────────────────────────────────
async function register(req, res) {
  const { username, email, password, referralCode } = req.body;

  const exists = db.get('users').find(u =>
    u.email === email.toLowerCase() || u.username === username.toLowerCase()
  ).value();
  if (exists) {
    const field = exists.email === email.toLowerCase() ? 'email' : 'username';
    return res.status(409).json({ error: `This ${field} is already taken` });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId       = uuidv4();
  const myCode       = 'BB' + Math.random().toString(36).slice(2, 8).toUpperCase();

  // Find referrer
  let referrerId = null;
  if (referralCode) {
    const referrer = db.get('users').find({ referralCode: referralCode.toUpperCase() }).value();
    if (referrer) referrerId = referrer.id;
  }

  const user = {
    id: userId,
    username:        username.trim(),
    email:           email.toLowerCase().trim(),
    passwordHash,
    referralCode:    myCode,
    referredBy:      referrerId,
    isAdmin:         false,
    kycVerified:     false,
    kycStatus:       'none',   // 'none' | 'pending' | 'verified' | 'rejected'
    twoFAEnabled:    false,
    twoFASecret:     null,
    banned:          false,
    emailVerified:   false,
    resetToken:      null,
    resetTokenExpiry:null,
    loginCount:      0,
    lastLogin:       null,
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
  };

  db.get('users').push(user).write();

  // Give $1,000 demo balance
  credit(userId, 'USD', 1000);

  // Handle referral bonus
  if (referrerId) {
    credit(referrerId, 'USD', REFERRAL_BONUS);
    credit(userId,     'USD', REFERRAL_BONUS);   // new user bonus too
    db.get('referrals').push({
      id: uuidv4(), referrerId, referredId: userId,
      bonus: REFERRAL_BONUS, createdAt: new Date().toISOString(),
    }).write();
    createNotification(referrerId, {
      type: 'referral', title: 'Referral Bonus!',
      message: `${username} joined using your code. You earned $${REFERRAL_BONUS}!`,
      meta: { referredUser: username },
    });
  }

  // Welcome notification
  createNotification(userId, {
    type: 'system', title: 'Welcome to BlueberryMarket! 🫐',
    message: 'Your account is set up. Start trading or share your referral code to earn bonuses.',
  });

  await sendWelcomeEmail(user);

  const tokens = issueTokens(userId);
  const { passwordHash: _, resetToken: __, resetTokenExpiry: ___, twoFASecret: ____, ...safeUser } = user;
  res.status(201).json({ ...tokens, user: safeUser });
}

// ── Login ─────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;
  const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.banned) return res.status(403).json({ error: 'Account suspended. Contact support.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  // Update login tracking
  user.loginCount  = (user.loginCount || 0) + 1;
  user.lastLogin   = new Date().toISOString();
  user.updatedAt   = new Date().toISOString();
  db.write();

  const tokens = issueTokens(user.id);
  const { passwordHash: _, resetToken: __, resetTokenExpiry: ___, twoFASecret: ____, ...safeUser } = user;
  res.json({ ...tokens, user: safeUser });
}

// ── Refresh token ─────────────────────────────────────────────
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  const payload = verifyRefreshToken(refreshToken);
  if (!payload)  return res.status(401).json({ error: 'Invalid or expired refresh token' });
  const tokens = issueTokens(payload.userId);
  res.json(tokens);
}

// ── Logout ────────────────────────────────────────────────────
async function logout(req, res) {
  db.get('sessions').remove({ userId: req.userId }).write();
  res.json({ message: 'Logged out successfully' });
}

// ── Get my profile ─────────────────────────────────────────────
async function getMe(req, res) {
  const { passwordHash, resetToken, resetTokenExpiry, twoFASecret, ...safe } = req.user;
  res.json(safe);
}

// ── Update profile ─────────────────────────────────────────────
async function updateProfile(req, res) {
  const user = db.get('users').find({ id: req.userId }).value();
  const { username } = req.body;
  if (username && username !== user.username) {
    const taken = db.get('users').find({ username }).value();
    if (taken) return res.status(409).json({ error: 'Username already taken' });
    user.username = username.trim();
  }
  user.updatedAt = new Date().toISOString();
  db.write();
  const { passwordHash, resetToken, resetTokenExpiry, twoFASecret, ...safe } = user;
  res.json(safe);
}

// ── Change password ─────────────────────────────────────────────
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = db.get('users').find({ id: req.userId }).value();
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.updatedAt    = new Date().toISOString();
  db.get('sessions').remove({ userId: req.userId }).write();   // invalidate all sessions
  db.write();
  res.json({ message: 'Password changed. Please log in again.' });
}

// ── Forgot password ─────────────────────────────────────────────
async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  // Always 200 to avoid user enumeration
  if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetToken       = code;
  user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.write();
  await sendPasswordResetEmail(user, code);
  res.json({ message: 'If that email exists, a reset code has been sent.' });
}

// ── Reset password ─────────────────────────────────────────────
async function resetPassword(req, res) {
  const { email, code, newPassword } = req.body;
  const user = db.get('users').find({ email: email.toLowerCase().trim() }).value();
  if (!user || user.resetToken !== code || new Date() > new Date(user.resetTokenExpiry))
    return res.status(400).json({ error: 'Invalid or expired reset code' });

  user.passwordHash     = await bcrypt.hash(newPassword, 12);
  user.resetToken       = null;
  user.resetTokenExpiry = null;
  user.updatedAt        = new Date().toISOString();
  db.get('sessions').remove({ userId: user.id }).write();
  db.write();
  res.json({ message: 'Password reset successfully. Please log in.' });
}

module.exports = { register, login, refresh, logout, getMe, updateProfile, changePassword, forgotPassword, resetPassword };
