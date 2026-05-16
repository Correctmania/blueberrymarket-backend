const db   = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function createNotification(userId, { type, title, message, meta = {} }) {
  const notif = {
    id:        uuidv4(),
    userId,
    type,       // 'trade' | 'deposit' | 'withdrawal' | 'referral' | 'kyc' | 'system'
    title,
    message,
    meta,
    read:      false,
    createdAt: new Date().toISOString(),
  };
  db.get('notifications').push(notif).write();
  return notif;
}

function getUserNotifications(userId, { unreadOnly = false, limit = 30 } = {}) {
  let q = db.get('notifications').filter({ userId });
  if (unreadOnly) q = q.filter({ read: false });
  return q.sortBy('createdAt').reverse().take(limit).value();
}

function markRead(userId, notifId) {
  if (notifId === 'all') {
    db.get('notifications').filter({ userId }).each(n => { n.read = true; }).write();
  } else {
    const n = db.get('notifications').find({ id: notifId, userId }).value();
    if (n) { n.read = true; db.write(); }
  }
}

function unreadCount(userId) {
  return db.get('notifications').filter({ userId, read: false }).size().value();
}

module.exports = { createNotification, getUserNotifications, markRead, unreadCount };
