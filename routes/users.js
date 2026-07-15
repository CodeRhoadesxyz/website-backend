const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

const userCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
};

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url || '',
    role: user.role || '',
    email: user.email || '',
  };
}

// Where the password-reset link should point — your blog page, wherever it
// actually lives. Falls back to a best guess (your first allowed origin +
// /blog.html) if BLOG_PAGE_URL isn't set, but setting it explicitly is safer.
function getBlogPageUrl() {
  if (process.env.BLOG_PAGE_URL) return process.env.BLOG_PAGE_URL;
  const firstOrigin = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim();
  return firstOrigin ? `${firstOrigin}/blog.html` : null;
}

router.post('/signup', (req, res) => {
  const { password, display_name, email } = req.body || {};
  const username = (req.body && req.body.username || '').toLowerCase();

  if (!username || !password || !display_name || !email) {
    return res.status(400).json({ error: 'Username, password, display name, and email are required.' });
  }
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, _ . -).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO users (username, display_name, password_hash, email) VALUES (?, ?, ?, ?)')
    .run(username, display_name, passwordHash, email.trim().toLowerCase());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie('user_token', token, userCookieOptions);
  res.status(201).json(publicUser(user));
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const username = (req.body && req.body.username || '').toLowerCase();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (user.is_banned) {
    return res.status(403).json({ error: 'This account has been suspended.' });
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie('user_token', token, userCookieOptions);
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  res.clearCookie('user_token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ ok: true });
});

// --- Request a password reset email ---
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());

  // Always respond the same way whether or not the email is registered, so
  // this can't be used to check which emails have accounts.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
      tokenHash,
      expires,
      user.id
    );

    const blogPageUrl = getBlogPageUrl();
    if (blogPageUrl) {
      const resetUrl = `${blogPageUrl}${blogPageUrl.includes('?') ? '&' : '?'}reset=${token}`;
      sendPasswordResetEmail(user, resetUrl);
    } else {
      console.warn('Password reset requested but BLOG_PAGE_URL/ALLOWED_ORIGINS is not set — cannot build a reset link.');
    }
  }

  res.json({ message: "If that email is registered, we've sent a password reset link." });
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
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(tokenHash);

  if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(
    'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
  ).run(passwordHash, user.id);

  res.json({ message: 'Password updated — you can now log in with your new password.' });
});

router.get('/me', requireUser, (req, res) => {
  res.json(req.user);
});

router.patch('/me', requireUser, (req, res) => {
  const { display_name, avatar_url, email } = req.body || {};
  const updates = {};

  if (display_name !== undefined) {
    if (!display_name.trim()) return res.status(400).json({ error: 'Display name cannot be empty.' });
    updates.display_name = display_name.trim();
  }
  if (avatar_url !== undefined) {
    updates.avatar_url = avatar_url.trim();
  }
  if (email !== undefined) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    updates.email = trimmed;
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.user.id });
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(publicUser(updated));
});

router.get('/', requireAdmin, (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.email, u.is_banned, u.created_at,
              (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
              (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comment_count
       FROM users u ORDER BY u.created_at DESC`
    )
    .all();
  res.json(users);
});

router.patch('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const before = {};
  if ('is_banned' in (req.body || {})) {
    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(req.body.is_banned ? 1 : 0, req.params.id);
    before.is_banned = user.is_banned;
  }
  if ('role' in (req.body || {})) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run((req.body.role || '').trim(), req.params.id);
    before.role = user.role;
  }
  if (Object.keys(before).length > 0) {
    logActivity(req.admin, 'users', 'edit', user.id, before);
  }

  const updated = db
    .prepare('SELECT id, username, display_name, role, email, is_banned, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'users', 'delete', user.id, user);
  res.json({ ok: true });
});

module.exports = router;
