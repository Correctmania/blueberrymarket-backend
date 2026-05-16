require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { credit } = require('../services/walletService');

async function seed() {
  console.log('🫐 Seeding BlueberryMarket database...\n');

  // ── Admin account ─────────────────────────────────────────
  const existingAdmin = db.get('users').find({ email: 'admin@blueberrymarket.com' }).value();
  if (!existingAdmin) {
    const adminId   = uuidv4();
    const adminHash = await bcrypt.hash('Admin@12345', 12);
    db.get('users').push({
      id: adminId,
      username:         'admin',
      email:            'admin@blueberrymarket.com',
      passwordHash:     adminHash,
      referralCode:     'BBADMIN',
      referredBy:       null,
      isAdmin:          true,
      kycVerified:      true,
      kycStatus:        'verified',
      twoFAEnabled:     false,
      twoFASecret:      null,
      banned:           false,
      emailVerified:    true,
      resetToken:       null,
      resetTokenExpiry: null,
      loginCount:       0,
      lastLogin:        null,
      createdAt:        new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
    }).write();
    credit(adminId, 'USD', 999999);
    console.log('✅ Admin created: admin@blueberrymarket.com / Admin@12345');
  } else {
    console.log('⏭  Admin already exists');
  }

  // ── Demo user ─────────────────────────────────────────────
  const existingDemo = db.get('users').find({ email: 'demo@blueberrymarket.com' }).value();
  if (!existingDemo) {
    const demoId   = uuidv4();
    const demoHash = await bcrypt.hash('Demo@12345', 12);
    db.get('users').push({
      id: demoId,
      username:         'demo_trader',
      email:            'demo@blueberrymarket.com',
      passwordHash:     demoHash,
      referralCode:     'BBDEMO01',
      referredBy:       null,
      isAdmin:          false,
      kycVerified:      true,
      kycStatus:        'verified',
      twoFAEnabled:     false,
      twoFASecret:      null,
      banned:           false,
      emailVerified:    true,
      resetToken:       null,
      resetTokenExpiry: null,
      loginCount:       5,
      lastLogin:        new Date().toISOString(),
      createdAt:        new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt:        new Date().toISOString(),
    }).write();
    credit(demoId, 'USD',  5000);
    credit(demoId, 'BTC',  0.05);
    credit(demoId, 'ETH',  1.2);
    credit(demoId, 'SOL',  25);
    console.log('✅ Demo user created: demo@blueberrymarket.com / Demo@12345');
  } else {
    console.log('⏭  Demo user already exists');
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('─────────────────────────────────────────');
  console.log('  Admin   → admin@blueberrymarket.com  /  Admin@12345');
  console.log('  Demo    → demo@blueberrymarket.com   /  Demo@12345');
  console.log('─────────────────────────────────────────\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
