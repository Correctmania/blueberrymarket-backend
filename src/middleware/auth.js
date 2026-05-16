const jwt = require('jsonwebtoken');
const db  = require('../config/database');

const JWT_SECRET         = process.env.JWT_SECRET         || 'blueberry_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'blueberry_refresh_secret';

// ── Verify access token ─────────────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authentication required' });

  try {
    const token   = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = db.get('users').find({ id: payload.userId }).value();
    if (!user)         return res.status(401).json({ error: 'User not found' });
    if (user.banned)   return res.status(403).json({ error: 'Account suspended. Contact support.' });
    req.userId = payload.userId;
    req.user   = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Admin-only guard ────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (!req.user?.isAdmin)
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── KYC-verified guard ──────────────────────────────────────────
function kycRequired(req, res, next) {
  if (!req.user?.kycVerified)
    return res.status(403).json({ error: 'KYC verification required for this action', code: 'KYC_REQUIRED' });
  next();
}

// ── Issue tokens ────────────────────────────────────────────────
function issueTokens(userId) {
  const accessToken  = jwt.sign({ userId }, JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  // persist refresh token
  db.get('sessions').remove({ userId }).write();
  db.get('sessions').push({ userId, refreshToken, createdAt: new Date().toISOString() }).write();
  return { accessToken, refreshToken };
}

// ── Verify refresh token ────────────────────────────────────────
function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const session = db.get('sessions').find({ userId: payload.userId, refreshToken: token }).value();
    if (!session) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { authenticate, adminOnly, kycRequired, issueTokens, verifyRefreshToken };
