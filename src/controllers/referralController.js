const db  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ── GET /referral/info ─────────────────────────────────────────
async function getInfo(req, res) {
  const user = req.user;
  const refs = db.get('referrals').filter({ referrerId: req.userId }).value();

  const referrals = refs.map(r => {
    const u = db.get('users').find({ id: r.referredId }).value();
    return { username: u?.username || 'Unknown', joinedAt: r.createdAt, bonus: r.bonus };
  });

  const totalEarned = refs.reduce((s, r) => s + (r.bonus || 0), 0);

  res.json({
    referralCode:  user.referralCode,
    referralLink:  `https://blueberrymarket.com/register?ref=${user.referralCode}`,
    totalReferrals: refs.length,
    totalEarned:   +totalEarned.toFixed(2),
    referrals,
  });
}

// ── POST /referral/validate ────────────────────────────────────
async function validateCode(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const user = db.get('users').find({ referralCode: code.toUpperCase() }).value();
  if (!user) return res.json({ valid: false });

  res.json({ valid: true, referrerUsername: user.username, bonus: parseFloat(process.env.REFERRAL_BONUS_USD) || 10 });
}

// ── GET /referral/leaderboard ──────────────────────────────────
async function leaderboard(req, res) {
  const all = db.get('referrals').value();
  const counts = {};
  for (const r of all) {
    counts[r.referrerId] = (counts[r.referrerId] || 0) + 1;
  }
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => {
      const u = db.get('users').find({ id: uid }).value();
      return { username: u?.username || 'Unknown', referrals: count };
    });
  res.json({ leaderboard: sorted });
}

module.exports = { getInfo, validateCode, leaderboard };
