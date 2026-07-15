const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

function withEffectivePrice(item) {
  return {
    ...item,
    effective_price: item.is_on_sale && item.sale_price != null ? item.sale_price : item.price,
  };
}

// --- Public: list items ---
router.get('/', (req, res) => {
  const { all } = req.query;
  const query = all === '1'
    ? 'SELECT * FROM store_items ORDER BY created_at DESC'
    : 'SELECT * FROM store_items WHERE is_published = 1 ORDER BY is_clearance DESC, is_on_sale DESC, created_at DESC';
  const items = db.prepare(query).all();
  res.json(items.map(withEffectivePrice));
});

// --- Admin: create ---
router.post('/', requireAdmin, (req, res) => {
  const { name, description, price, sale_price, is_on_sale, is_clearance, is_sold_out, image_url, buy_url, is_published } =
    req.body || {};

  if (!name || price == null || price === '') {
    return res.status(400).json({ error: 'Name and price are required.' });
  }
  if (isNaN(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
  }
  if (is_on_sale && (sale_price == null || sale_price === '' || isNaN(Number(sale_price)))) {
    return res.status(400).json({ error: 'Sale price is required when marking an item on sale.' });
  }

  const result = db
    .prepare(
      `INSERT INTO store_items
        (name, description, price, sale_price, is_on_sale, is_clearance, is_sold_out, image_url, buy_url, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      description || '',
      Number(price),
      sale_price != null && sale_price !== '' ? Number(sale_price) : null,
      is_on_sale ? 1 : 0,
      is_clearance ? 1 : 0,
      is_sold_out ? 1 : 0,
      image_url || '',
      buy_url || '',
      is_published === false ? 0 : 1
    );

  const created = db.prepare('SELECT * FROM store_items WHERE id = ?').get(result.lastInsertRowid);
  logActivity(req.admin, 'store_items', 'create', created.id, created);
  res.status(201).json(withEffectivePrice(created));
});

// --- Admin: update (including starting/ending a sale or clearance) ---
router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM store_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  const body = req.body || {};

  if ('price' in body && (isNaN(Number(body.price)) || Number(body.price) < 0)) {
    return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
  }

  const willBeOnSale = 'is_on_sale' in body ? Boolean(body.is_on_sale) : Boolean(existing.is_on_sale);
  const willHaveSalePrice = 'sale_price' in body ? body.sale_price : existing.sale_price;
  if (willBeOnSale && (willHaveSalePrice == null || willHaveSalePrice === '' || isNaN(Number(willHaveSalePrice)))) {
    return res.status(400).json({ error: 'Sale price is required when marking an item on sale.' });
  }

  const fields = ['name', 'description', 'price', 'sale_price', 'image_url', 'buy_url'];
  const updates = {};
  for (const field of fields) {
    if (field in body) updates[field] = body[field] === '' && field === 'sale_price' ? null : body[field];
  }
  if ('is_on_sale' in body) updates.is_on_sale = body.is_on_sale ? 1 : 0;
  if ('is_clearance' in body) updates.is_clearance = body.is_clearance ? 1 : 0;
  if ('is_sold_out' in body) updates.is_sold_out = body.is_sold_out ? 1 : 0;
  if ('is_published' in body) updates.is_published = body.is_published ? 1 : 0;

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE store_items SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });

    const before = {};
    Object.keys(updates).forEach((field) => { before[field] = existing[field]; });
    logActivity(req.admin, 'store_items', 'edit', existing.id, before);
  }

  const updated = db.prepare('SELECT * FROM store_items WHERE id = ?').get(req.params.id);
  res.json(withEffectivePrice(updated));
});

// --- Admin: delete ---
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM store_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  db.prepare('DELETE FROM store_items WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'store_items', 'delete', existing.id, existing);
  res.json({ ok: true });
});

module.exports = router;
