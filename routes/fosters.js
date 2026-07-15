const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const { bird_id, active } = req.query;

  let query = `
    SELECT f.*, b.name as bird_name
    FROM fosters f JOIN birds b ON b.id = f.bird_id
    WHERE 1=1`;
  const params = [];

  if (bird_id) {
    query += ' AND f.bird_id = ?';
    params.push(bird_id);
  }
  if (active === '1') {
    query += ' AND f.end_date IS NULL';
  }

  query += ' ORDER BY f.start_date DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', requireAdmin, (req, res) => {
  const { bird_id, foster_name, foster_contact, start_date, notes } = req.body || {};

  if (!bird_id || !foster_name || !start_date) {
    return res.status(400).json({ error: 'Bird, foster name, and start date are required.' });
  }

  const bird = db.prepare('SELECT id FROM birds WHERE id = ?').get(bird_id);
  if (!bird) return res.status(404).json({ error: 'Bird not found.' });

  const result = db
    .prepare('INSERT INTO fosters (bird_id, foster_name, foster_contact, start_date, notes) VALUES (?, ?, ?, ?, ?)')
    .run(bird_id, foster_name, foster_contact || '', start_date, notes || '');

  const created = db
    .prepare('SELECT f.*, b.name as bird_name FROM fosters f JOIN birds b ON b.id = f.bird_id WHERE f.id = ?')
    .get(result.lastInsertRowid);
  logActivity(req.admin, 'fosters', 'create', created.id, created);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM fosters WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Foster record not found.' });

  const fields = ['foster_name', 'foster_contact', 'start_date', 'end_date', 'notes'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) updates[field] = req.body[field];
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE fosters SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

    const before = {};
    Object.keys(updates).forEach((field) => { before[field] = existing[field]; });
    logActivity(req.admin, 'fosters', 'edit', existing.id, before);
  }

  const updated = db
    .prepare('SELECT f.*, b.name as bird_name FROM fosters f JOIN birds b ON b.id = f.bird_id WHERE f.id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM fosters WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Foster record not found.' });

  db.prepare('DELETE FROM fosters WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'fosters', 'delete', existing.id, existing);
  res.json({ ok: true });
});

module.exports = router;
