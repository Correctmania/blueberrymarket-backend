const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── USER ──────────────────────────────────────────────────────
const UserSchema = new Schema({
  username:         { type: String, required: true, unique: true, trim: true },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:     { type: String, required: true },
  referralCode:     { type: String, unique: true },
  referredBy:       { type: String, default: null },
  isAdmin:          { type: Boolean, default: false },
  kycVerified:      { type: Boolean, default: false },
  kycStatus:        { type: String, enum: ['none','pending','verified','rejected'], default: 'none' },
  twoFAEnabled:     { type: Boolean, default: false },
  twoFASecret:      { type: String, default: null },
  banned:           { type: Boolean, default: false },
  emailVerified:    { type: Boolean, default: false },
  resetToken:       { type: String, default: null },
  resetTokenExpiry: { type: Date,   default: null },
  loginCount:       { type: Number, default: 0 },
  lastLogin:        { type: Date,   default: null },
}, { timestamps: true });

// ── WALLET ────────────────────────────────────────────────────
const WalletSchema = new Schema({
  userId:   { type: String, required: true, unique: true },
  balances: {
    USD:  { type: Number, default: 0 },
    BTC:  { type: Number, default: 0 },
    ETH:  { type: Number, default: 0 },
    BNB:  { type: Number, default: 0 },
    SOL:  { type: Number, default: 0 },
    ADA:  { type: Number, default: 0 },
    XRP:  { type: Number, default: 0 },
    DOGE: { type: Number, default: 0 },
    AVAX: { type: Number, default: 0 },
    MATIC:{ type: Number, default: 0 },
    DOT:  { type: Number, default: 0 },
    LTC:  { type: Number, default: 0 },
    LINK: { type: Number, default: 0 },
    UNI:  { type: Number, default: 0 },
    ATOM: { type: Number, default: 0 },
    USDT: { type: Number, default: 0 },
    USDC: { type: Number, default: 0 },
  },
}, { timestamps: true });

// ── TRANSACTION ───────────────────────────────────────────────
const TransactionSchema = new Schema({
  userId:    { type: String, required: true, index: true },
  type:      { type: String, enum: ['deposit','withdrawal','admin_credit','admin_deduct'], required: true },
  currency:  { type: String, required: true },
  amount:    { type: Number, required: true },
  fee:       { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  method:    { type: String, default: 'bank_transfer' },
  txHash:    { type: String, default: null },
  address:   { type: String, default: null },
  network:   { type: String, default: null },
  memo:      { type: String, default: null },
  status:    { type: String, enum: ['pending','completed','rejected'], default: 'pending' },
  note:      { type: String, default: '' },
}, { timestamps: true });

// ── TRADE ─────────────────────────────────────────────────────
const TradeSchema = new Schema({
  userId:       { type: String, required: true, index: true },
  type:         { type: String, enum: ['buy','sell'], required: true },
  symbol:       { type: String, required: true },
  amountCrypto: { type: Number, required: true },
  amountUSD:    { type: Number, required: true },
  grossUSD:     { type: Number, default: 0 },
  fee:          { type: Number, default: 0 },
  totalCost:    { type: Number, default: 0 },
  price:        { type: Number, required: true },
  status:       { type: String, default: 'completed' },
}, { timestamps: true });

// ── REFERRAL ──────────────────────────────────────────────────
const ReferralSchema = new Schema({
  referrerId: { type: String, required: true, index: true },
  referredId: { type: String, required: true },
  bonus:      { type: Number, default: 10 },
}, { timestamps: true });

// ── NOTIFICATION ──────────────────────────────────────────────
const NotificationSchema = new Schema({
  userId:  { type: String, required: true, index: true },
  type:    { type: String, default: 'system' },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  meta:    { type: Schema.Types.Mixed, default: {} },
  read:    { type: Boolean, default: false },
}, { timestamps: true });

// ── KYC ───────────────────────────────────────────────────────
const KycSchema = new Schema({
  userId:         { type: String, required: true, index: true },
  firstName:      String, lastName: String,
  dateOfBirth:    String, country: String,
  documentType:   String, documentNumber: String,
  addressLine1:   String, city: String, postalCode: String,
  status:         { type: String, enum: ['pending','verified','rejected'], default: 'pending' },
  reviewedAt:     { type: Date, default: null },
  reviewerNote:   { type: String, default: null },
}, { timestamps: true });

// ── SUPPORT ───────────────────────────────────────────────────
const SupportSchema = new Schema({
  userId:   { type: String, required: true, index: true },
  subject:  { type: String, required: true },
  message:  { type: String, required: true },
  category: { type: String, default: 'general' },
  status:   { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open' },
  priority: { type: String, default: 'normal' },
  replies:  [{ from: String, adminId: String, message: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

// ── SESSION ───────────────────────────────────────────────────
const SessionSchema = new Schema({
  userId:       { type: String, required: true, index: true },
  refreshToken: { type: String, required: true },
}, { timestamps: true });

// ── ADMIN LOG ─────────────────────────────────────────────────
const AdminLogSchema = new Schema({
  adminId: { type: String, required: true },
  action:  { type: String, required: true },
  meta:    { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = {
  User:         mongoose.model('User',         UserSchema),
  Wallet:       mongoose.model('Wallet',       WalletSchema),
  Transaction:  mongoose.model('Transaction',  TransactionSchema),
  Trade:        mongoose.model('Trade',        TradeSchema),
  Referral:     mongoose.model('Referral',     ReferralSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  Kyc:          mongoose.model('Kyc',          KycSchema),
  Support:      mongoose.model('Support',      SupportSchema),
  Session:      mongoose.model('Session',      SessionSchema),
  AdminLog:     mongoose.model('AdminLog',     AdminLogSchema),
};
