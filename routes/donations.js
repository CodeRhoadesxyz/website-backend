const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_METHODS = ['cash', 'check', 'online', 'in_kind', 'other'];

// All donation routes are admin-only — this is internal bookkeeping, not a
// public donation form (there's no online payment processing here, just a
// log of gifts that came in by check, cash, or an outside platform).
router.use(requireAdmin);

function applyFilters(query, params, req) {
  const { from, to, method, campaign } = req.query;

  if (from) {
    query += ' AND donation_date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND donation_date <= ?';
    params.push(to);
  }
  if (method) {
    if (!VALID_METHODS.includes(method)) throw new Error('Unknown method.');
    query += ' AND method = ?';
    params.push(method);
  }
  if (campaign) {
    query += ' AND campaign LIKE ?';
    params.push(`%${campaign}%`);
  }
  return query;
}

router.get('/', (req, res) => {
  let query = 'SELECT * FROM donations WHERE 1=1';
  const params = [];

  try {
    query = applyFilters(query, params, req);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  query += ' ORDER BY donation_date DESC, id DESC';
  res.json(db.prepare(query).all(...params));
});

// Report data for the Donations tab: totals, breakdown by method, by month,
// and top donors — all respecting the same from/to/method/campaign filters
// as the main list, so the numbers on screen always match what's filtered.
router.get('/summary', (req, res) => {
  let base = 'SELECT * FROM donations WHERE 1=1';
  const params = [];

  try {
    base = applyFilters(base, params, req);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const rows = db.prepare(base).all(...params);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const count = rows.length;

  const byMethod = {};
  for (const method of VALID_METHODS) byMethod[method] = 0;
  for (const r of rows) byMethod[r.method] = (byMethod[r.method] || 0) + r.amount;

  const byMonth = {};
  for (const r of rows) {
    const month = (r.donation_date || '').slice(0, 7); // YYYY-MM
    byMonth[month] = (byMonth[month] || 0) + r.amount;
  }

  const donorTotals = {};
  for (const r of rows) {
    const key = r.donor_email ? r.donor_email.toLowerCase() : r.donor_name;
    if (!donorTotals[key]) donorTotals[key] = { donor_name: r.donor_name, donor_email: r.donor_email, total: 0, count: 0 };
    donorTotals[key].total += r.amount;
    donorTotals[key].count += 1;
  }
  const topDonors = Object.values(donorTotals)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  res.json({
    total,
    count,
    average: count > 0 ? total / count : 0,
    by_method: byMethod,
    by_month: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })),
    top_donors: topDonors,
  });
});

router.get('/export', (req, res) => {
  let query = 'SELECT * FROM donations WHERE 1=1';
  const params = [];

  try {
    query = applyFilters(query, params, req);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  query += ' ORDER BY donation_date DESC, id DESC';
  const rows = db.prepare(query).all(...params);

  const escapeCsv = (val) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = ['Date', 'Donor Name', 'Donor Email', 'Amount', 'Method', 'Campaign', 'Recurring', 'Notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.donation_date,
      r.donor_name,
      r.donor_email,
      r.amount.toFixed(2),
      r.method,
      r.campaign,
      r.is_recurring ? 'Yes' : 'No',
      r.notes,
    ].map(escapeCsv).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Donation not found.' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { donor_name, donor_email, amount, donation_date, method, campaign, is_recurring, notes } = req.body || {};

  if (!donor_name || !String(donor_name).trim()) {
    return res.status(400).json({ error: 'Donor name is required.' });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }
  if (!donation_date) {
    return res.status(400).json({ error: 'Donation date is required.' });
  }
  if (method && !VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Unknown method.' });
  }

  const result = db
    .prepare(
      `INSERT INTO donations (donor_name, donor_email, amount, donation_date, method, campaign, is_recurring, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      donor_name.trim(),
      donor_email || '',
      amountNum,
      donation_date,
      method || 'other',
      campaign || '',
      is_recurring ? 1 : 0,
      notes || ''
    );

  const created = db.prepare('SELECT * FROM donations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM donations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Donation not found.' });

  if (req.body && 'method' in req.body && !VALID_METHODS.includes(req.body.method)) {
    return res.status(400).json({ error: 'Unknown method.' });
  }
  if (req.body && 'amount' in req.body) {
    const amountNum = Number(req.body.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }
  }

  const fields = ['donor_name', 'donor_email', 'amount', 'donation_date', 'method', 'campaign', 'is_recurring', 'notes'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) {
      let value = req.body[field];
      if (field === 'is_recurring') value = value ? 1 : 0;
      if (field === 'amount') value = Number(value);
      updates[field] = value;
    }
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE donations SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });
  }

  const updated = db.prepare('SELECT * FROM donations WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM donations WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Donation not found.' });
  res.json({ ok: true });
});

module.exports = router;
