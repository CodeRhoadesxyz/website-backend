const express = require('express');
const db = require('../db');
const { requireAdmin, requireTabPermission } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', (req, res) => {
  const { all } = req.query;
  const query = all === '1'
    ? 'SELECT * FROM testimonials ORDER BY created_at DESC'
    : 'SELECT * FROM testimonials WHERE is_approved = 1 ORDER BY created_at DESC';
  res.json(db.prepare(query).all());
});

router.post('/', (req, res) => {
  const { author_name, bird_name, story, photo_url } = req.body || {};
  if (!author_name || !story) {
    return res.status(400).json({ error: 'Your name and story are required.' });
  }

  const result = db
    .prepare('INSERT INTO testimonials (author_name, bird_name, story, photo_url) VALUES (?, ?, ?, ?)')
    .run(author_name, bird_name || '', story, photo_url || '');

  res.status(201).json({ id: result.lastInsertRowid, message: 'Thank you! Your story will appear once reviewed.' });
});

router.patch('/:id', requireAdmin, requireTabPermission('testimonials'), (req, res) => {
  const existing = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Testimonial not found.' });

  if ('is_approved' in (req.body || {})) {
    db.prepare('UPDATE testimonials SET is_approved = ? WHERE id = ?').run(req.body.is_approved ? 1 : 0, req.params.id);
    logActivity(req.admin, 'testimonials', 'edit', existing.id, { is_approved: existing.is_approved });
  }

  const updated = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, requireTabPermission('testimonials'), (req, res) => {
  const existing = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Testimonial not found.' });

  db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'testimonials', 'delete', existing.id, existing);
  res.json({ ok: true });
});

module.exports = router;
