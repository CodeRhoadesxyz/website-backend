const express = require('express');
const db = require('../db');
const { requireAdmin, requireTabPermission } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', (req, res) => {
  const { all } = req.query;
  const query = all === '1'
    ? 'SELECT * FROM faqs ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM faqs WHERE is_published = 1 ORDER BY sort_order ASC, created_at ASC';
  res.json(db.prepare(query).all());
});

router.post('/', requireAdmin, requireTabPermission('faqs'), (req, res) => {
  const { question, answer, sort_order, is_published } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required.' });

  const result = db
    .prepare('INSERT INTO faqs (question, answer, sort_order, is_published) VALUES (?, ?, ?, ?)')
    .run(question, answer, sort_order ?? 0, is_published === false ? 0 : 1);

  const created = db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid);
  logActivity(req.admin, 'faqs', 'create', created.id, created);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, requireTabPermission('faqs'), (req, res) => {
  const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'FAQ not found.' });

  const fields = ['question', 'answer', 'sort_order'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) updates[field] = req.body[field];
  }
  if ('is_published' in (req.body || {})) updates.is_published = req.body.is_published ? 1 : 0;

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE faqs SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

    const before = {};
    Object.keys(updates).forEach((field) => { before[field] = existing[field]; });
    logActivity(req.admin, 'faqs', 'edit', existing.id, before);
  }

  const updated = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, requireTabPermission('faqs'), (req, res) => {
  const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'FAQ not found.' });

  db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'faqs', 'delete', existing.id, existing);
  res.json({ ok: true });
});

module.exports = router;
