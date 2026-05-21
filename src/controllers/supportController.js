const { Support } = require('../models');
const { createNotification } = require('../services/notificationService');

async function createTicket(req, res) {
  const { subject, message, category } = req.body;
  if (!subject || !message) return res.status(422).json({ error: 'Subject and message are required' });
  const ticket = await Support.create({ userId: req.userId, subject: subject.trim(), message: message.trim(), category: category || 'general' });
  await createNotification(req.userId, { type: 'system', title: 'Support Ticket Created', message: `Ticket submitted. We will reply within 24 hours.` });
  res.status(201).json({ ticket });
}

async function listTickets(req, res) {
  const tickets = await Support.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ tickets });
}

async function getTicket(req, res) {
  const ticket = await Support.findOne({ _id: req.params.id, userId: req.userId });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
}

async function replyToTicket(req, res) {
  const { message } = req.body;
  if (!message) return res.status(422).json({ error: 'Message required' });
  const ticket = await Support.findOne({ _id: req.params.id, userId: req.userId });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket is closed' });
  ticket.replies.push({ from: 'user', message: message.trim(), createdAt: new Date() });
  ticket.status = 'in_progress';
  await ticket.save();
  res.json({ ticket });
}

module.exports = { createTicket, listTickets, getTicket, replyToTicket };
