const { getUserNotifications, markRead, unreadCount } = require('../services/notificationService');

async function list(req, res) {
  const { unreadOnly, limit } = req.query;
  const notifs = await getUserNotifications(req.userId, { unreadOnly: unreadOnly === 'true', limit: parseInt(limit) || 30 });
  const unread = await unreadCount(req.userId);
  res.json({ notifications: notifs, unreadCount: unread });
}

async function markAsRead(req, res) {
  await markRead(req.userId, req.params.id);
  res.json({ message: 'Marked as read' });
}

module.exports = { list, markAsRead };
