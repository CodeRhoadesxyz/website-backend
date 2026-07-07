const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const EXPIRY_DAYS = 5;

// --- Public: the single most recent published announcement (or null) ---
// The homepage widget calls this — it's intentionally "one at a time" so the
// banner never gets bulky, no matter how many announcements pile up in admin.
// Anything older than EXPIRY_DAYS is excluded here (but not deleted — it
// just stops being shown to visitors; see the admin list route below).
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

// --- Admin: list all announcements ---
// Nothing is ever auto-deleted — old announcements stay here permanently
// (until an admin deletes them) with is_active: false once they pass
// EXPIRY_DAYS, so the admin panel can show an "Inactive" tag.
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const withActiveFlag = rows.map((row) => {
    const createdAtMs = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    return { ...row, is_active: createdAtMs >= cutoff };
  });
  res.json(withActiveFlag);
});

// --- Admin: create ---
router.post('/', requireAdmin, (req, res) => {
  const { title, message, link_url, link_text, is_published } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  const result = db
    .prepare(
      `INSERT INTO announcements (title, message, link_url, link_text, is_published)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(title, message, link_url || '', link_text || '', is_published === false ? 0 : 1);

  const created = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// --- Admin: update ---
router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Announcement not found.' });

  const fields = ['title', 'message', 'link_url', 'link_text', 'is_published'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) {
      let value = req.body[field];
      // better-sqlite3 only accepts numbers, strings, bigints, buffers, and
      // null as bound parameters — a raw JS boolean throws, so is_published
      // has to be converted to 0/1 here (the create route already does this).
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

// --- Admin: delete ---
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found.' });
  res.json({ ok: true });
});

module.exports = router;
