const { Referral, User } = require('../models');
const REFERRAL_BONUS = parseFloat(process.env.REFERRAL_BONUS_USD) || 10;

async function getInfo(req, res) {
  const user = req.user;
  const refs = await Referral.find({ referrerId: req.userId });
  const referrals = await Promise.all(refs.map(async r => {
    const u = await User.findById(r.referredId).select('username createdAt');
    return { username: u?.username || 'Unknown', joinedAt: r.createdAt, bonus: r.bonus };
  }));
  const totalEarned = refs.reduce((s, r) => s + (r.bonus || 0), 0);
  res.json({ referralCode: user.referralCode, referralLink: `https://blueberrymarket.netlify.app/register?ref=${user.referralCode}`, totalReferrals: refs.length, totalEarned: +totalEarned.toFixed(2), referrals });
}

async function validateCode(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  const user = await User.findOne({ referralCode: code.toUpperCase() });
  if (!user) return res.json({ valid: false });
  res.json({ valid: true, referrerUsername: user.username, bonus: REFERRAL_BONUS });
}

async function leaderboard(req, res) {
  const refs = await Referral.find();
  const counts = {};
  for (const r of refs) counts[r.referrerId] = (counts[r.referrerId] || 0) + 1;
  const sorted = await Promise.all(
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(async ([uid, count]) => {
      const u = await User.findById(uid).select('username');
      return { username: u?.username || 'Unknown', referrals: count };
    })
  );
  res.json({ leaderboard: sorted });
}

module.exports = { getInfo, validateCode, leaderboard };
