const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.NODE_ENV === 'production') {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    // Dev: log emails to console instead
    transporter = { sendMail: async (opts) => { console.log('[EMAIL]', opts.subject, '->', opts.to); return {}; } };
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'BlueberryMarket <noreply@blueberrymarket.com>',
      to, subject, html, text,
    });
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
  }
}

// ── Templates ────────────────────────────────────────────────────
const brand = (content) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0d0520;color:#f0eaff;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#4f20e8,#7c4dff);padding:28px 32px">
    <h1 style="margin:0;font-size:22px">🫐 BlueberryMarket</h1>
  </div>
  <div style="padding:32px">${content}</div>
  <div style="padding:16px 32px;font-size:12px;color:#9e8dc0;border-top:1px solid #1e0f42">
    © 2025 BlueberryMarket · <a href="#" style="color:#b39ddb">Unsubscribe</a>
  </div>
</div>`;

async function sendWelcomeEmail(user) {
  await sendEmail({
    to: user.email,
    subject: '🫐 Welcome to BlueberryMarket!',
    html: brand(`
      <h2>Welcome, ${user.username}! 🎉</h2>
      <p>Your account is ready. You've received a <strong style="color:#00e5a0">$1,000 demo balance</strong> to start trading.</p>
      <p>Your referral code: <strong style="font-family:monospace;font-size:18px;color:#b39ddb">${user.referralCode}</strong></p>
      <a href="https://blueberrymarket.com/dashboard" style="display:inline-block;background:linear-gradient(135deg,#4f20e8,#7c4dff);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">Go to Dashboard</a>`),
  });
}

async function sendDepositEmail(user, tx) {
  await sendEmail({
    to: user.email,
    subject: `✅ Deposit Confirmed — ${tx.amount} ${tx.currency}`,
    html: brand(`
      <h2>Deposit Confirmed</h2>
      <p>Your deposit of <strong>${tx.amount} ${tx.currency}</strong> has been processed.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
        <tr><td style="padding:8px;color:#9e8dc0">Transaction ID</td><td style="padding:8px;font-family:monospace">${tx.id}</td></tr>
        <tr><td style="padding:8px;color:#9e8dc0">Amount</td><td style="padding:8px">${tx.amount} ${tx.currency}</td></tr>
        <tr><td style="padding:8px;color:#9e8dc0">Status</td><td style="padding:8px;color:#00e5a0">Completed</td></tr>
        <tr><td style="padding:8px;color:#9e8dc0">Date</td><td style="padding:8px">${new Date(tx.createdAt).toUTCString()}</td></tr>
      </table>`),
  });
}

async function sendWithdrawEmail(user, tx) {
  await sendEmail({
    to: user.email,
    subject: `📤 Withdrawal Submitted — ${tx.amount} ${tx.currency}`,
    html: brand(`
      <h2>Withdrawal Submitted</h2>
      <p>Your withdrawal request for <strong>${tx.amount} ${tx.currency}</strong> is being processed.</p>
      <p style="color:#9e8dc0;font-size:13px">Withdrawals typically take 1-3 business days.</p>`),
  });
}

async function sendTradeEmail(user, trade) {
  const action = trade.type === 'buy' ? 'Bought' : 'Sold';
  await sendEmail({
    to: user.email,
    subject: `⚡ ${action} ${trade.symbol} — Trade Confirmed`,
    html: brand(`
      <h2>Trade Executed</h2>
      <p>${action} <strong>${trade.amountCrypto} ${trade.symbol}</strong> at <strong>$${trade.price.toLocaleString()}</strong></p>
      <p style="font-family:monospace;font-size:12px;color:#9e8dc0">Order ID: ${trade.id}</p>`),
  });
}

async function sendPasswordResetEmail(user, resetToken) {
  await sendEmail({
    to: user.email,
    subject: '🔐 Reset Your Password — BlueberryMarket',
    html: brand(`
      <h2>Password Reset</h2>
      <p>We received a request to reset your password. Click below to set a new password.</p>
      <p style="font-family:monospace;font-size:20px;letter-spacing:4px;color:#b39ddb;text-align:center;padding:16px;background:#1e0f42;border-radius:8px">${resetToken}</p>
      <p style="color:#9e8dc0;font-size:13px">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>`),
  });
}

module.exports = { sendWelcomeEmail, sendDepositEmail, sendWithdrawEmail, sendTradeEmail, sendPasswordResetEmail };
