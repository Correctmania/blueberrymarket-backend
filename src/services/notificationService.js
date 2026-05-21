const { Notification } = require('../models');

async function createNotification(userId, { type, title, message, meta = {} }) {
  return await Notification.create({ userId, type, title, message, meta });
}

async function getUserNotifications(userId, { unreadOnly = false, limit = 30 } = {}) {
  const q = { userId };
  if (unreadOnly) q.read = false;
  return await Notification.find(q).sort({ createdAt: -1 }).limit(limit);
}

async function markRead(userId, notifId) {
  if (notifId === 'all') {
    await Notification.updateMany({ userId }, { read: true });
  } else {
    await Notification.findOneAndUpdate({ _id: notifId, userId }, { read: true });
  }
}

async function unreadCount(userId) {
  return await Notification.countDocuments({ userId, read: false });
}

module.exports = { createNotification, getUserNotifications, markRead, unreadCount };
