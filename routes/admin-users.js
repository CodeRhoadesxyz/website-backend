const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireSuperAdmin, ALL_TABS } = require('../middleware/auth');
const { summarizeActivity } = require('../lib/activityLog');

const router = express.Router();

// Managing admin accounts — including who can see/touch what — is
// restricted to the super admin (SUPER_ADMIN_USERNAME) only, for every
// route in this file. This isn't something the super admin can delegate:
// if any regular admin could create/edit other admins or grant
// permissions, they could just grant themselves full access and this whole
// system would mean nothing.
router.use(requireSuperAdmin);

router.get('/', (req, res) => {
  const admins = db.prepare('SELECT id, username, email, tab_permissions, created_at FROM admins ORDER BY created_at ASC').all();
  const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
  res.json(
    admins.map((a) => {
      let tab_permissions = null;
      try {
        tab_permissions = a.tab_permissions ? JSON.parse(a.tab_permissions) : null;
      } catch (err) {
        tab_permissions = null;
      }
      return {
        id: a.id,
        username: a.username,
        email: a.email,
        created_at: a.created_at,
        tab_permissions,
        is_super_admin: superUsername !== '' && a.username.toLowerCase() === superUsername,
      };
    })
  );
});

router.post('/', (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const trimmedEmail = (email || '').trim().toLowerCase();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)')
    .run(username, passwordHash, trimmedEmail);
  const created = db.prepare('SELECT id, username, email, created_at FROM admins WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// --- Edit an admin account (username and/or password) ---
router.patch('/:id', (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const { username, password, email } = req.body || {};
  const updates = {};

  if (username !== undefined) {
    const trimmed = username.trim();
    if (!trimmed) return res.status(400).json({ error: 'Username cannot be empty.' });
    const existing = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(trimmed, req.params.id);
    if (existing) return res.status(409).json({ error: 'That username is already taken.' });
    updates.username = trimmed;
  }

  if (email !== undefined) {
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    updates.email = trimmedEmail;
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

  const updated = db.prepare('SELECT id, username, email, created_at FROM admins WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// --- Set which tabs an admin can view/edit ---
// Body shape: { tab_permissions: { "events": { "view": true, "edit": false }, ... } }
// or { tab_permissions: null } to clear all restrictions (full access again).
// Only tabs in ALL_TABS are accepted; anything else is rejected outright
// rather than silently dropped, so a typo doesn't quietly do nothing.
router.patch('/:id/permissions', (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
  if (superUsername && admin.username.toLowerCase() === superUsername) {
    return res.status(400).json({ error: 'The super admin always has full access — permissions cannot be restricted on this account.' });
  }

  const { tab_permissions } = req.body || {};

  if (tab_permissions === null) {
    db.prepare('UPDATE admins SET tab_permissions = NULL WHERE id = ?').run(req.params.id);
    return res.json({ id: admin.id, tab_permissions: null });
  }

  if (typeof tab_permissions !== 'object' || Array.isArray(tab_permissions)) {
    return res.status(400).json({ error: 'tab_permissions must be an object (or null to clear restrictions).' });
  }

  const cleaned = {};
  for (const [tab, entry] of Object.entries(tab_permissions)) {
    if (!ALL_TABS.includes(tab)) {
      return res.status(400).json({ error: `Unknown tab: "${tab}".` });
    }
    if (!entry || typeof entry !== 'object') {
      return res.status(400).json({ error: `Invalid permission entry for "${tab}".` });
    }
    cleaned[tab] = { view: entry.view !== false, edit: entry.edit !== false };
    // Editing something you can't view doesn't make sense — keep the two
    // consistent so a stray client bug can't produce edit-but-not-view.
    if (!cleaned[tab].view) cleaned[tab].edit = false;
  }

  db.prepare('UPDATE admins SET tab_permissions = ? WHERE id = ?').run(JSON.stringify(cleaned), req.params.id);
  res.json({ id: admin.id, tab_permissions: cleaned });
});

router.delete('/:id', (req, res) => {
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
router.get('/:id/activity', (req, res) => {
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
router.post('/:id/activity/undo', (req, res) => {
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
