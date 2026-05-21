const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Blueberryadmin:Donmania1@blueberrymarket.9o48hgg.mongodb.net/blueberrymarket?retryWrites=true&w=majority&appName=Blueberrymarket';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => console.log('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnected'));

module.exports = { connectDB };
