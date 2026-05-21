const { Kyc, User } = require('../models');
const { createNotification } = require('../services/notificationService');

async function submit(req, res) {
  const user = req.user;
  if (user.kycStatus === 'verified') return res.status(400).json({ error: 'Already verified' });
  if (user.kycStatus === 'pending')  return res.status(400).json({ error: 'Already under review' });
  const { firstName, lastName, dateOfBirth, country, documentType, documentNumber, addressLine1, city, postalCode } = req.body;
  if (!firstName || !lastName || !dateOfBirth || !country || !documentType || !documentNumber)
    return res.status(422).json({ error: 'All required fields must be provided' });
  const kycRecord = await Kyc.create({ userId: req.userId, firstName, lastName, dateOfBirth, country, documentType, documentNumber, addressLine1, city, postalCode });
  await User.findByIdAndUpdate(req.userId, { kycStatus: 'pending' });
  if (process.env.NODE_ENV !== 'production') {
    setTimeout(async () => {
      await Kyc.findByIdAndUpdate(kycRecord._id, { status: 'verified', reviewedAt: new Date() });
      await User.findByIdAndUpdate(req.userId, { kycVerified: true, kycStatus: 'verified' });
      await createNotification(req.userId, { type: 'kyc', title: 'KYC Verified ✅', message: 'Your identity has been verified!' });
    }, 5000);
  }
  await createNotification(req.userId, { type: 'kyc', title: 'KYC Submitted', message: 'Your documents are under review.' });
  res.status(201).json({ message: 'KYC submitted successfully', status: 'pending' });
}

async function getStatus(req, res) {
  const user = req.user;
  const record = await Kyc.findOne({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ kycStatus: user.kycStatus, kycVerified: user.kycVerified, submittedAt: record?.createdAt || null, reviewedAt: record?.reviewedAt || null, reviewerNote: record?.reviewerNote || null });
}

module.exports = { submit, getStatus };
