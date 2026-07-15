const express = require('express');
const db = require('../db');
const { requireAdmin, requireTabPermission } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', (req, res) => {
  const { all } = req.query;
  const query = all === '1'
    ? 'SELECT * FROM wishlist_items ORDER BY is_fulfilled ASC, created_at DESC'
    : 'SELECT * FROM wishlist_items WHERE is_fulfilled = 0 ORDER BY created_at DESC';
  res.json(db.prepare(query).all());
});

router.post('/', requireAdmin, requireTabPermission('wishlist'), (req, res) => {
  const { item_name, description, quantity_needed } = req.body || {};
  if (!item_name) return res.status(400).json({ error: 'Item name is required.' });

  const result = db
    .prepare('INSERT INTO wishlist_items (item_name, description, quantity_needed) VALUES (?, ?, ?)')
    .run(item_name, description || '', quantity_needed || '');

  const created = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(result.lastInsertRowid);
  logActivity(req.admin, 'wishlist_items', 'create', created.id, created);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, requireTabPermission('wishlist'), (req, res) => {
  const existing = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  const fields = ['item_name', 'description', 'quantity_needed'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) updates[field] = req.body[field];
  }
  if ('is_fulfilled' in (req.body || {})) updates.is_fulfilled = req.body.is_fulfilled ? 1 : 0;

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE wishlist_items SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

    const before = {};
    Object.keys(updates).forEach((field) => { before[field] = existing[field]; });
    logActivity(req.admin, 'wishlist_items', 'edit', existing.id, before);
  }

  const updated = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, requireTabPermission('wishlist'), (req, res) => {
  const existing = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'wishlist_items', 'delete', existing.id, existing);
  res.json({ ok: true });
});

module.exports = router;
