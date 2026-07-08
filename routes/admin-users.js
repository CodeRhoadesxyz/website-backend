const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const admins = db.prepare('SELECT id, username, email, created_at FROM admins ORDER BY created_at ASC').all();
  res.json(admins);
});

router.post('/', requireAdmin, (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look valid.' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)')
    .run(username, passwordHash, (email || '').trim());
  const created = db.prepare('SELECT id, username, email, created_at FROM admins WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// --- Edit an admin account (username and/or password) ---
router.patch('/:id', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const { username, password, email } = req.body || {};
  const updates = {};

  if (username !== undefined) {
    const trimmed = username.trim();
    if (!trimmed) return res.status(400).json({ error: 'Username cannot be empty.' });
    const existing = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(trimmed, req.params.id);
    if (existing) return res.status(409).json({ error: 'That username is already taken.' });
    updates.username = trimmed;
  }

  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'That email address doesn\'t look valid.' });
    }
    updates.email = email.trim();
  }

  if (password !== undefined && password !== '') {
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    updates.password_hash = bcrypt.hashSync(password, 12);
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE admins SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  }

  const updated = db.prepare('SELECT id, username, email, created_at FROM admins WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account while signed in as it." });
  }

  const totalAdmins = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (totalAdmins <= 1) {
    return res.status(400).json({ error: 'At least one admin account must remain — add another before removing this one.' });
  }

  const result = db.prepare('DELETE FROM admins WHERE id = ?').run(targetId);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found.' });

  // Free up anything this admin had claimed rather than leaving it stuck
  // "claimed" by an account that no longer exists.
  db.prepare('UPDATE applications SET claimed_by = NULL, claimed_at = NULL WHERE claimed_by = ?').run(targetId);

  res.json({ ok: true });
});

module.exports = router;
