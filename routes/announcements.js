const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const EXPIRY_DAYS = 5;

router.get('/latest', (req, res) => {
  const announcement = db
    .prepare(
      `SELECT * FROM announcements
       WHERE is_published = 1 AND created_at >= datetime('now', '-${EXPIRY_DAYS} days')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get();
  res.json(announcement || null);
});

router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const withActiveFlag = rows.map((row) => {
    const createdAtMs = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    return { ...row, is_active: createdAtMs >= cutoff };
  });
  res.json(withActiveFlag);
});

router.post('/', requireAdmin, (req, res) => {
  const { title, message, link_url, link_text, image_url, is_published } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  const result = db
    .prepare(
      `INSERT INTO announcements (title, message, link_url, link_text, image_url, is_published)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, message, link_url || '', link_text || '', image_url || '', is_published === false ? 0 : 1);

  const created = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Announcement not found.' });

  const fields = ['title', 'message', 'link_url', 'link_text', 'image_url', 'is_published'];
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
    db.prepare(`UPDATE announcements SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });
  }

  const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found.' });
  res.json({ ok: true });
});

module.exports = router;
