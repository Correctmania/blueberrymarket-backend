const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { createNotification } = require('../services/notificationService');

// ── POST /support/ticket ───────────────────────────────────────
async function createTicket(req, res) {
  const { subject, message, category } = req.body;
  if (!subject || !message)
    return res.status(422).json({ error: 'Subject and message are required' });

  const ticket = {
    id:        uuidv4(),
    userId:    req.userId,
    subject:   subject.trim(),
    message:   message.trim(),
    category:  category || 'general',   // 'general' | 'billing' | 'trading' | 'kyc' | 'technical'
    status:    'open',                   // 'open' | 'in_progress' | 'resolved' | 'closed'
    priority:  'normal',                 // 'low' | 'normal' | 'high' | 'urgent'
    replies:   [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.get('support').push(ticket).write();

  createNotification(req.userId, {
    type: 'system', title: 'Support Ticket Created',
    message: `Ticket #${ticket.id.slice(0, 8)} has been submitted. Our team will reply within 24 hours.`,
  });

  res.status(201).json({ ticket });
}

// ── GET /support/tickets ───────────────────────────────────────
async function listTickets(req, res) {
  const tickets = db.get('support').filter({ userId: req.userId })
    .sortBy('createdAt').reverse().value();
  res.json({ tickets });
}

// ── GET /support/tickets/:id ───────────────────────────────────
async function getTicket(req, res) {
  const ticket = db.get('support').find({ id: req.params.id, userId: req.userId }).value();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
}

// ── POST /support/tickets/:id/reply ───────────────────────────
async function replyToTicket(req, res) {
  const { message } = req.body;
  if (!message) return res.status(422).json({ error: 'Message required' });

  const ticket = db.get('support').find({ id: req.params.id, userId: req.userId }).value();
  if (!ticket)   return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket is closed' });

  ticket.replies.push({ from: 'user', message: message.trim(), createdAt: new Date().toISOString() });
  ticket.status    = 'in_progress';
  ticket.updatedAt = new Date().toISOString();
  db.write();

  res.json({ ticket });
}

module.exports = { createTicket, listTickets, getTicket, replyToTicket };
