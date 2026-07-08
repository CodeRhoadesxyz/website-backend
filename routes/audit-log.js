const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

function applyFilters(query, params, req) {
  const { admin_id, q, from, to } = req.query;

  if (admin_id) {
    query += ' AND admin_id = ?';
    params.push(admin_id);
  }
  if (q) {
    query += ' AND (action LIKE ? OR admin_username LIKE ? OR path LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from) {
    query += ' AND created_at >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND created_at <= ?';
    params.push(to);
  }
  return query;
}

router.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  let baseQuery = 'FROM audit_log WHERE 1=1';
  const params = [];
  baseQuery = applyFilters(baseQuery, params, req);

  const total = db.prepare(`SELECT COUNT(*) as c ${baseQuery}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * ${baseQuery} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ entries: rows, total, page, limit });
});

// Distinct admins who have entries, so the filter dropdown in the UI only
// ever lists people who've actually done something (rather than every admin
// account that's ever existed, including ones since removed).
router.get('/admins', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT admin_id, admin_username FROM audit_log WHERE admin_id IS NOT NULL ORDER BY admin_username ASC`
    )
    .all();
  res.json(rows);
});

router.get('/export', (req, res) => {
  let baseQuery = 'FROM audit_log WHERE 1=1';
  const params = [];
  baseQuery = applyFilters(baseQuery, params, req);

  const rows = db.prepare(`SELECT * ${baseQuery} ORDER BY id DESC`).all(...params);

  const escapeCsv = (val) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = ['Timestamp', 'Admin', 'Action', 'Method', 'Path', 'IP', 'Details'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.created_at, r.admin_username, r.action, r.method, r.path, r.ip, r.details]
        .map(escapeCsv)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
