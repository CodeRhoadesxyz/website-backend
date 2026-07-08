const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { createResetToken, verifyResetToken, consumeResetToken } = require('../lib/passwordReset');
const { sendPasswordResetEmail } = require('../lib/email');
const { logManual } = require('../lib/auditLog');

const router = express.Router();

// Where the admin portal is actually served, so reset links point somewhere
// real. Falls back to same-origin-relative in case it's not set.
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || '';

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 12, // 12 hours
};

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    logManual({ action: `Failed sign-in attempt for "${username}"`, req });
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });

  res.cookie('admin_token', token, cookieOptions);
  logManual({ adminId: admin.id, adminUsername: admin.username, action: 'Signed in', req });
  res.json({ username: admin.username });
});

router.post('/logout', (req, res) => {
  // No requireAdmin on this route (you should always be able to sign out
  // even with an expired token), so identify who's leaving by hand — best
  // effort, since an already-invalid token just means we log without a name.
  const token = req.cookies && req.cookies.admin_token;
  let outgoing = null;
  if (token) {
    try {
      outgoing = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // expired/invalid — nothing to attribute the log entry to
    }
  }

  res.clearCookie('admin_token', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  if (outgoing) {
    logManual({ adminId: outgoing.id, adminUsername: outgoing.username, action: 'Signed out', req });
  }
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ id: req.admin.id, username: req.admin.username });
});

// --- Forgot / reset password ---

router.post('/forgot-password', async (req, res) => {
  const { username } = req.body || {};

  // Always respond with the same generic message whether or not the account
  // exists (or has an email on file) — otherwise this endpoint becomes a way
  // to check which admin usernames are valid.
  const genericResponse = { ok: true, message: 'If that account exists, a reset link has been sent.' };

  if (!username) return res.json(genericResponse);

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !admin.email) return res.json(genericResponse);

  const rawToken = createResetToken('admin', admin.id);
  const resetUrl = `${ADMIN_BASE_URL}/admin/reset-password.html?token=${rawToken}`;

  await sendPasswordResetEmail({ to: admin.email, resetUrl, accountLabel: 'admin' });

  res.json(genericResponse);
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const verified = verifyResetToken(token);
  if (!verified || verified.accountType !== 'admin') {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, verified.accountId);
  consumeResetToken(verified.tokenHash);

  const resetAdmin = db.prepare('SELECT username FROM admins WHERE id = ?').get(verified.accountId);
  logManual({
    adminId: verified.accountId,
    adminUsername: resetAdmin ? resetAdmin.username : '',
    action: 'Reset password via emailed link',
    req,
  });

  res.json({ ok: true });
});

module.exports = router;
