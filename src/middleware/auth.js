const jwt = require('jsonwebtoken');
const { User, Session } = require('../models');
const JWT_SECRET = process.env.JWT_SECRET || 'blueberry_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'blueberry_refresh_secret';

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'Account suspended.' });
    req.userId = payload.userId;
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

function kycRequired(req, res, next) {
  if (!req.user?.kycVerified) return res.status(403).json({ error: 'KYC verification required', code: 'KYC_REQUIRED' });
  next();
}

function issueTokens(userId) {
  const accessToken  = jwt.sign({ userId }, JWT_SECRET,         { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
  Session.deleteMany({ userId }).then(() => Session.create({ userId, refreshToken }));
  return { accessToken, refreshToken };
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch { return null; }
}

module.exports = { authenticate, adminOnly, kycRequired, issueTokens, verifyRefreshToken };
