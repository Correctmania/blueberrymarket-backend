require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/mongodb');
const { User } = require('../models');
const { credit } = require('../services/walletService');

async function seed() {
  await connectDB();
  console.log('🫐 Seeding BlueberryMarket database...\n');

  // Admin
  const existingAdmin = await User.findOne({ email: 'admin@blueberrymarket.com' });
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash('Admin@12345', 12);
    const admin = await User.create({ username: 'admin', email: 'admin@blueberrymarket.com', passwordHash: adminHash, referralCode: 'BBADMIN01', isAdmin: true, kycVerified: true, kycStatus: 'verified', emailVerified: true });
    await credit(admin._id.toString(), 'USD', 999999);
    console.log('✅ Admin created: admin@blueberrymarket.com / Admin@12345');
  } else {
    // Make sure existing admin has isAdmin flag
    await User.findByIdAndUpdate(existingAdmin._id, { isAdmin: true, kycVerified: true, kycStatus: 'verified' });
    console.log('✅ Admin already exists — updated admin flags');
  }

  // Demo user
  const existingDemo = await User.findOne({ email: 'demo@blueberrymarket.com' });
  if (!existingDemo) {
    const demoHash = await bcrypt.hash('Demo@12345', 12);
    const demo = await User.create({ username: 'demo_trader', email: 'demo@blueberrymarket.com', passwordHash: demoHash, referralCode: 'BBDEMO001', kycVerified: true, kycStatus: 'verified', emailVerified: true });
    await credit(demo._id.toString(), 'USD', 5000);
    await credit(demo._id.toString(), 'BTC', 0.05);
    await credit(demo._id.toString(), 'ETH', 1.2);
    console.log('✅ Demo user created: demo@blueberrymarket.com / Demo@12345');
  } else {
    console.log('✅ Demo user already exists');
  }

  console.log('\n🎉 Seeding complete!');
  console.log('Admin: admin@blueberrymarket.com / Admin@12345');
  console.log('Demo:  demo@blueberrymarket.com  / Demo@12345\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
