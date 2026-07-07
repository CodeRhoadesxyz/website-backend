const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';

// Separate cookie name AND SameSite setting from the admin cookie.
// The admin panel runs same-origin (behind the Cloudflare Worker/PHP proxy),
// so 'lax' works fine there. This cookie, though, is used by the blog widget
// embedded directly on the main site's pages — a genuinely cross-site
// request from the visitor's browser to the Railway backend — which requires
// SameSite=None (and therefore Secure) for the browser to send/accept it.
const userCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
};

function publicUser(user) {
  return { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url || '' };
}

// --- Public: create an account ---
router.post('/signup', (req, res) => {
  const { password, display_name } = req.body || {};
  // Usernames are normalized to lowercase so login can never fail just
  // because of a casing mismatch (e.g. signing up as "Dalton" but typing
  // "dalton" later) — the display_name (shown on posts/comments) keeps
  // whatever capitalization the person actually typed.
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

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
    .run(username, display_name, passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie('user_token', token, userCookieOptions);
  res.status(201).json(publicUser(user));
});

// --- Public: log in ---
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

// --- Edit your own profile (display name and/or profile picture URL) ---
router.patch('/me', requireUser, (req, res) => {
  const { display_name, avatar_url } = req.body || {};
  const updates = {};

  if (display_name !== undefined) {
    if (!display_name.trim()) return res.status(400).json({ error: 'Display name cannot be empty.' });
    updates.display_name = display_name.trim();
  }
  if (avatar_url !== undefined) {
    updates.avatar_url = avatar_url.trim();
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

// --- Admin: list all users (for moderation) ---
router.get('/', requireAdmin, (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.is_banned, u.created_at,
              (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
              (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comment_count
       FROM users u ORDER BY u.created_at DESC`
    )
    .all();
  res.json(users);
});

// --- Admin: ban/unban a user ---
router.patch('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if ('is_banned' in (req.body || {})) {
    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(req.body.is_banned ? 1 : 0, req.params.id);
  }

  const updated = db.prepare('SELECT id, username, display_name, is_banned, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// --- Admin: delete a user entirely (their posts/comments cascade-delete too) ---
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

module.exports = router;
