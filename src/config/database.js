const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const adapter = new FileSync(DB_PATH);
const db = low(adapter);

// ── Default schema ─────────────────────────────────────────────
db.defaults({
  users:         [],   // user accounts
  wallets:       [],   // per-user wallet balances
  transactions:  [],   // deposits / withdrawals
  trades:        [],   // buy / sell orders
  referrals:     [],   // referral relationships
  notifications: [],   // in-app notifications
  kyc:           [],   // KYC submission records
  support:       [],   // support tickets
  sessions:      [],   // active refresh tokens
  admin_log:     [],   // admin action audit log
  price_history: {},   // { BTC: [{date, open, high, low, close, volume}] }
}).write();

module.exports = db;
