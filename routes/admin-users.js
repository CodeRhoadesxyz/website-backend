const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const admins = db.prepare('SELECT id, username, created_at FROM admins ORDER BY created_at ASC').all();
  res.json(admins);
});

router.post('/', requireAdmin, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  const created = db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
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
  res.json({ ok: true });
});

module.exports = router;
