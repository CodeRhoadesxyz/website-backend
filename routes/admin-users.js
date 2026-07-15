const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { summarizeActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const admins = db.prepare('SELECT id, username, created_at FROM admins ORDER BY created_at ASC').all();
  const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
  res.json(admins.map((a) => ({ ...a, is_super_admin: superUsername !== '' && a.username.toLowerCase() === superUsername })));
});

router.post('/', requireAdmin, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  const created = db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// --- Edit an admin account (username and/or password) ---
router.patch('/:id', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const { username, password } = req.body || {};
  const updates = {};

  if (username !== undefined) {
    const trimmed = username.trim();
    if (!trimmed) return res.status(400).json({ error: 'Username cannot be empty.' });
    const existing = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(trimmed, req.params.id);
    if (existing) return res.status(409).json({ error: 'That username is already taken.' });
    updates.username = trimmed;
  }

  if (password !== undefined && password !== '') {
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    updates.password_hash = bcrypt.hashSync(password, 12);
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE admins SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  }

  const updated = db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account while signed in as it." });
  }

  const totalAdmins = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (totalAdmins <= 1) {
    return res.status(400).json({ error: 'At least one admin account must remain — add another before removing this one.' });
  }

  const result = db.prepare('DELETE FROM admins WHERE id = ?').run(targetId);
  if (result.changes === 0) return res.status(404).json({ error: 'Admin not found.' });
  res.json({ ok: true });
});

// --- List one admin's recent undoable actions across the whole panel ---
router.get('/:id/activity', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const entries = db
    .prepare(
      `SELECT * FROM activity_log
       WHERE admin_id = ? AND is_undone = 0
       ORDER BY created_at DESC LIMIT 100`
    )
    .all(req.params.id);

  res.json(
    entries.map((e) => ({
      id: e.id,
      table: e.table_name,
      action: e.action,
      rowId: e.row_id,
      summary: summarizeActivity(e),
      createdAt: e.created_at,
    }))
  );
});

// Tables that should never be excluded from undo-column filtering — keeps
// this endpoint honest about what actually exists right now, same approach
// as the database tools panel.
function getRealColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function isRealTable(table) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
  return tables.includes(table);
}

// --- Undo a batch of one admin's actions in one go ---
router.post('/:id/activity/undo', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Select at least one action to undo.' });
  }

  const results = [];

  for (const logId of ids) {
    const entry = db
      .prepare('SELECT * FROM activity_log WHERE id = ? AND admin_id = ?')
      .get(logId, req.params.id);

    if (!entry) {
      results.push({ id: logId, ok: false, error: 'Not found.' });
      continue;
    }
    if (entry.is_undone) {
      results.push({ id: logId, ok: false, error: 'Already undone.' });
      continue;
    }
    if (!isRealTable(entry.table_name)) {
      results.push({ id: logId, ok: false, error: 'That table no longer exists.' });
      continue;
    }

    try {
      const table = entry.table_name;
      const currentColumns = getRealColumns(table);
      const snapshot = JSON.parse(entry.snapshot);

      if (entry.action === 'edit') {
        const stillExists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(entry.row_id);
        if (!stillExists) {
          results.push({ id: logId, ok: false, error: 'That row no longer exists.' });
          continue;
        }
        const fields = Object.keys(snapshot).filter((f) => currentColumns.includes(f));
        if (fields.length === 0) {
          results.push({ id: logId, ok: false, error: 'Nothing left to restore.' });
          continue;
        }
        const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
        db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = @id`).run({
          ...Object.fromEntries(fields.map((f) => [f, snapshot[f]])),
          id: entry.row_id,
        });
      } else if (entry.action === 'delete') {
        const fields = Object.keys(snapshot).filter((f) => currentColumns.includes(f));
        const placeholders = fields.map((f) => `@${f}`).join(', ');
        db.prepare(`INSERT OR IGNORE INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(
          Object.fromEntries(fields.map((f) => [f, snapshot[f]]))
        );
      } else if (entry.action === 'create') {
        // Undoing a "create" means removing what was created.
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(entry.row_id);
      }

      db.prepare('UPDATE activity_log SET is_undone = 1 WHERE id = ?').run(entry.id);
      results.push({ id: logId, ok: true });
    } catch (err) {
      results.push({ id: logId, ok: false, error: err.message });
    }
  }

  res.json({ results });
});

module.exports = router;
