const { v4: uuidv4 } = require('uuid');
const db   = require('../config/database');
const { createNotification } = require('../services/notificationService');

// ── POST /kyc/submit ───────────────────────────────────────────
async function submit(req, res) {
  const user = db.get('users').find({ id: req.userId }).value();

  if (user.kycStatus === 'verified')
    return res.status(400).json({ error: 'Your identity is already verified' });
  if (user.kycStatus === 'pending')
    return res.status(400).json({ error: 'Your KYC is already under review' });

  const {
    firstName, lastName, dateOfBirth,
    country, documentType, documentNumber,
    addressLine1, city, postalCode,
  } = req.body;

  if (!firstName || !lastName || !dateOfBirth || !country || !documentType || !documentNumber)
    return res.status(422).json({ error: 'All required fields must be provided' });

  const kycRecord = {
    id:              uuidv4(),
    userId:          req.userId,
    firstName,
    lastName,
    dateOfBirth,
    country,
    documentType,    // 'passport' | 'national_id' | 'drivers_license'
    documentNumber,
    addressLine1:    addressLine1 || '',
    city:            city || '',
    postalCode:      postalCode || '',
    status:          'pending',
    submittedAt:     new Date().toISOString(),
    reviewedAt:      null,
    reviewerNote:    null,
  };

  db.get('kyc').push(kycRecord).write();

  user.kycStatus  = 'pending';
  user.updatedAt  = new Date().toISOString();
  db.write();

  // Auto-approve in dev mode after 5 seconds
  if (process.env.NODE_ENV !== 'production') {
    setTimeout(() => {
      const rec = db.get('kyc').find({ id: kycRecord.id }).value();
      if (rec) {
        rec.status     = 'verified';
        rec.reviewedAt = new Date().toISOString();
        db.write();
        const u = db.get('users').find({ id: req.userId }).value();
        if (u) { u.kycVerified = true; u.kycStatus = 'verified'; u.updatedAt = new Date().toISOString(); db.write(); }
        createNotification(req.userId, {
          type: 'kyc', title: 'KYC Verified ✅',
          message: 'Your identity has been verified. All platform features are now unlocked.',
        });
      }
    }, 5000);
  }

  createNotification(req.userId, {
    type: 'kyc', title: 'KYC Submitted',
    message: 'Your identity documents are under review. This usually takes 1-3 business days.',
  });

  res.status(201).json({ message: 'KYC submitted successfully', kycId: kycRecord.id, status: 'pending' });
}

// ── GET /kyc/status ────────────────────────────────────────────
async function getStatus(req, res) {
  const user   = req.user;
  const record = db.get('kyc').filter({ userId: req.userId }).sortBy('submittedAt').reverse().first().value();

  res.json({
    kycStatus:    user.kycStatus,
    kycVerified:  user.kycVerified,
    submittedAt:  record?.submittedAt  || null,
    reviewedAt:   record?.reviewedAt   || null,
    reviewerNote: record?.reviewerNote || null,
  });
}

module.exports = { submit, getStatus };
