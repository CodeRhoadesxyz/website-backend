const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['available', 'pending', 'adopted'];

router.get('/', (req, res) => {
  const { status, all } = req.query;

  let query = 'SELECT * FROM birds WHERE 1=1';
  const params = [];

  if (all !== '1') {
    query += ' AND is_published = 1';
    if (status) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
      query += ' AND status = ?';
      params.push(status);
    } else {
      query += " AND status != 'adopted'";
    }
  } else if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    query += ' AND status = ?';
    params.push(status);
  }

  query += ` ORDER BY
    CASE status WHEN 'available' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
    created_at DESC`;

  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const bird = db.prepare('SELECT * FROM birds WHERE id = ?').get(req.params.id);
  if (!bird || !bird.is_published) return res.status(404).json({ error: 'Bird not found.' });
  res.json(bird);
});

router.post('/', requireAdmin, (req, res) => {
  const { name, species, age, sex, description, photo_url, status, is_published } = req.body || {};

  if (!name || !species) {
    return res.status(400).json({ error: 'Name and species are required.' });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  const result = db
    .prepare(
      `INSERT INTO birds (name, species, age, sex, description, photo_url, status, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      species,
      age || '',
      sex || '',
      description || '',
      photo_url || '',
      status || 'available',
      is_published === false ? 0 : 1
    );

  const created = db.prepare('SELECT * FROM birds WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM birds WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bird not found.' });

  if (req.body && req.body.status && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  const fields = ['name', 'species', 'age', 'sex', 'description', 'photo_url', 'status', 'is_published'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) {
      let value = req.body[field];
      if (field === 'is_published') value = value ? 1 : 0;
      updates[field] = value;
    }
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE birds SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });
  }

  const updated = db.prepare('SELECT * FROM birds WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM birds WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Bird not found.' });
  res.json({ ok: true });
});

module.exports = router;
