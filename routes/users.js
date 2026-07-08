const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');
const { createResetToken, verifyResetToken, consumeResetToken } = require('../lib/passwordReset');
const { sendPasswordResetEmail } = require('../lib/email');

const router = express.Router();

// Where the blog/front-end lives, so reset links point to a real page there
// (e.g. https://heartandsoulparrotrescue.com/reset-password).
const SITE_BASE_URL = process.env.SITE_BASE_URL || '';

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

router.post('/signup', (req, res) => {
  const { password, display_name, email } = req.body || {};
  const username = (req.body && req.body.username || '').toLowerCase();

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Username, password, and display name are required.' });
  }
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, _ . -).' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  // Email is optional at signup (existing accounts won't have one either),
  // but if it's provided, make sure it's at least plausible — without an
  // email on file the account simply can't use "forgot password" later.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look valid.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO users (username, display_name, password_hash, email) VALUES (?, ?, ?, ?)')
    .run(username, display_name, passwordHash, (email || '').trim());

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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'That email address doesn\'t look valid.' });
    }
    updates.email = email.trim();
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

// --- Forgot / reset password (blog accounts) ---

router.post('/forgot-password', async (req, res) => {
  const { username } = req.body || {};

  // Same generic response regardless of outcome, so this can't be used to
  // enumerate valid usernames.
  const genericResponse = { ok: true, message: 'If that account exists, a reset link has been sent.' };

  if (!username) return res.json(genericResponse);

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
  if (!user || !user.email) return res.json(genericResponse);

  const rawToken = createResetToken('user', user.id);
  const resetUrl = `${SITE_BASE_URL}/reset-password?token=${rawToken}`;

  await sendPasswordResetEmail({ to: user.email, resetUrl, accountLabel: 'blog' });

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
  if (!verified || verified.accountType !== 'user') {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, verified.accountId);
  consumeResetToken(verified.tokenHash);

  res.json({ ok: true });
});

router.get('/', requireAdmin, (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_banned, u.created_at,
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

  if ('is_banned' in (req.body || {})) {
    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(req.body.is_banned ? 1 : 0, req.params.id);
  }
  if ('role' in (req.body || {})) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run((req.body.role || '').trim(), req.params.id);
  }

  const updated = db
    .prepare('SELECT id, username, display_name, role, is_banned, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

module.exports = router;
