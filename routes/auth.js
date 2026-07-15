const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendAdminPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 12, // 12 hours
};

// Where the admin portal's reset-password.html page is publicly reachable —
// used to build the link inside password reset emails. Falls back to a best
// guess (first allowed origin + /admin/reset-password.html) if not set.
function getAdminResetUrl(token) {
  const base = process.env.ADMIN_PORTAL_URL || (() => {
    const firstOrigin = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim();
    return firstOrigin ? `${firstOrigin}/admin/reset-password.html` : null;
  })();
  if (!base) return null;
  return `${base}${base.includes('?') ? '&' : '?'}token=${token}`;
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(username);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });

  res.cookie('admin_token', token, cookieOptions);
  res.json({ username: admin.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id, username, email, tab_permissions FROM admins WHERE id = ?').get(req.admin.id);
  const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
  const is_super_admin = superUsername !== '' && admin.username.toLowerCase() === superUsername;
  let tab_permissions = null;
  try {
    tab_permissions = admin.tab_permissions ? JSON.parse(admin.tab_permissions) : null;
  } catch (err) {
    tab_permissions = null;
  }
  res.json({ id: admin.id, username: admin.username, email: admin.email, is_super_admin, tab_permissions });
});

// Lets a signed-in admin set/update their own email — needed before
// forgot-password can do anything for that account.
router.patch('/me', requireAdmin, (req, res) => {
  const { email } = req.body || {};
  if (email === undefined) return res.status(400).json({ error: 'Nothing to update.' });

  const trimmed = email.trim().toLowerCase();
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  db.prepare('UPDATE admins SET email = ? WHERE id = ?').run(trimmed, req.admin.id);
  const updated = db.prepare('SELECT id, username, email FROM admins WHERE id = ?').get(req.admin.id);
  res.json(updated);
});

// --- Request a password reset email ---
router.post('/forgot-password', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(username.trim());

  // Always the same response whether or not the account exists (or has an
  // email on file) — otherwise this endpoint becomes a way to check which
  // admin usernames are valid. The console log is server-side only, purely
  // so you can tell from the deploy logs whether a request even matched.
  console.log(`Admin password reset requested for "${username}" — account found: ${Boolean(admin)}, has email: ${Boolean(admin && admin.email)}`);

  if (admin && admin.email) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare('UPDATE admins SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
      tokenHash,
      expires,
      admin.id
    );

    const resetUrl = getAdminResetUrl(token);
    if (resetUrl) {
      sendAdminPasswordResetEmail(admin, resetUrl);
    } else {
      console.warn('Admin password reset requested but ADMIN_PORTAL_URL/ALLOWED_ORIGINS is not set — cannot build a reset link.');
    }
  }

  res.json({ message: 'If that account exists and has an email on file, a reset link has been sent.' });
});

// --- Complete a password reset using the token from the email ---
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Reset token and new password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const admin = db.prepare('SELECT * FROM admins WHERE reset_token = ?').get(tokenHash);

  if (!admin || !admin.reset_token_expires || new Date(admin.reset_token_expires) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(
    'UPDATE admins SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
  ).run(passwordHash, admin.id);

  res.json({ message: 'Password updated — you can now log in with your new password.' });
});

module.exports = router;
