const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// --- Public: join the waitlist for a bird ---
router.post('/', (req, res) => {
  const { bird_id, name, email, phone, notes } = req.body || {};
  if (!bird_id || !name || !email) {
    return res.status(400).json({ error: 'Name, email, and bird are required.' });
  }

  const bird = db.prepare('SELECT id FROM birds WHERE id = ?').get(bird_id);
  if (!bird) return res.status(404).json({ error: 'Bird not found.' });

  const result = db
    .prepare('INSERT INTO waitlist (bird_id, name, email, phone, notes) VALUES (?, ?, ?, ?, ?)')
    .run(bird_id, name, email, phone || '', notes || '');

  res.status(201).json({ id: result.lastInsertRowid, message: "You're on the waitlist — we'll reach out if this bird becomes available." });
});

// --- Admin: view the waitlist for a bird (or all) ---
router.get('/', requireAdmin, (req, res) => {
  const { bird_id } = req.query;
  const query = bird_id
    ? `SELECT w.*, b.name as bird_name FROM waitlist w JOIN birds b ON b.id = w.bird_id WHERE w.bird_id = ? ORDER BY w.created_at ASC`
    : `SELECT w.*, b.name as bird_name FROM waitlist w JOIN birds b ON b.id = w.bird_id ORDER BY w.created_at ASC`;
  res.json(bird_id ? db.prepare(query).all(bird_id) : db.prepare(query).all());
});

// --- Admin: remove someone from a waitlist ---
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM waitlist WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Waitlist entry not found.' });
  res.json({ ok: true });
});

module.exports = router;
