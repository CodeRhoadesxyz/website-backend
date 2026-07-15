const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Columns that should never be readable/editable through this raw tool,
// regardless of which table they're on — password hashes and reset tokens
// have their own dedicated, safer endpoints elsewhere in the app.
const SENSITIVE_COLUMNS = new Set(['password_hash', 'reset_token', 'reset_token_expires']);

// The admins table is deliberately excluded from flush here — wiping it out
// could lock every admin out with no way back in. Manage admin accounts
// through the existing Admin Access tab instead, which has its own
// safeguards (can't remove the last admin, etc). undo_log is excluded
// because it's this tool's own internal bookkeeping table, not app data.
const PROTECTED_FROM_FLUSH = new Set(['admins', 'undo_log']);

// How long an undo stays available before it's just noise in the list. The
// row itself isn't deleted after this — it just stops showing up — so
// nothing is ever silently lost, this only affects what's easy to find.
const UNDO_WINDOW_HOURS = 72;

function getRealTableNames() {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name)
    .filter((name) => name !== 'undo_log'); // internal table, not app data — hidden from the overview
}

function assertValidTable(table) {
  const tables = getRealTableNames();
  if (!tables.includes(table)) {
    const err = new Error('Unknown table.');
    err.statusCode = 400;
    throw err;
  }
  return table;
}

function getColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function redactRow(row) {
  const copy = { ...row };
  for (const col of SENSITIVE_COLUMNS) {
    if (col in copy) copy[col] = copy[col] ? '••••••••' : copy[col];
  }
  return copy;
}

function logUndo(table, action, rowId, snapshot) {
  db.prepare('INSERT INTO undo_log (table_name, action, row_id, snapshot) VALUES (?, ?, ?, ?)').run(
    table,
    action,
    rowId,
    JSON.stringify(snapshot)
  );
}

// --- Overview: every table with its row count, for monitoring ---
router.get('/tables', requireSuperAdmin, (req, res) => {
  const tables = getRealTableNames();
  const overview = tables.map((table) => {
    const { c } = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
    return { table, rowCount: c, protectedFromFlush: PROTECTED_FROM_FLUSH.has(table) };
  });
  res.json(overview);
});

// --- Browse rows in one table, paginated ---
router.get('/tables/:table/rows', requireSuperAdmin, (req, res) => {
  try {
    const table = assertValidTable(req.params.table);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    const { c: total } = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();

    res.json({
      table,
      total,
      limit,
      offset,
      columns: getColumns(table),
      sensitiveColumns: [...SENSITIVE_COLUMNS],
      rows: rows.map(redactRow),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// --- Edit one row's fields (sensitive columns are always rejected) ---
// Snapshots only the fields actually being changed (their old values)
// before applying the update, so it can be undone later.
router.patch('/tables/:table/rows/:id', requireSuperAdmin, (req, res) => {
  try {
    const table = assertValidTable(req.params.table);
    const columns = getColumns(table);
    const body = req.body || {};

    const updates = {};
    for (const key of Object.keys(body)) {
      if (SENSITIVE_COLUMNS.has(key)) {
        return res.status(400).json({ error: `"${key}" can't be edited through this tool.` });
      }
      if (key === 'id') continue; // never let the primary key itself be edited
      if (!columns.includes(key)) {
        return res.status(400).json({ error: `"${key}" is not a real column on ${table}.` });
      }
      updates[key] = body[key];
    }

    const changedFields = Object.keys(updates);
    const setClause = changedFields.map((field) => `${field} = @${field}`).join(', ');

    if (!setClause) {
      return res.status(400).json({ error: 'No editable fields were provided.' });
    }

    const before = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!before) {
      return res.status(404).json({ error: 'No row with that id.' });
    }

    const result = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No row with that id.' });
    }

    const previousValues = {};
    changedFields.forEach((field) => { previousValues[field] = before[field]; });
    logUndo(table, 'edit', Number(req.params.id), previousValues);

    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(redactRow(updated));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// --- Flush (delete every row in) one table — requires typing the table name to confirm ---
// Snapshots every row before deleting them, so the whole table can be
// restored later via undo.
router.delete('/tables/:table/flush', requireSuperAdmin, (req, res) => {
  try {
    const table = assertValidTable(req.params.table);

    if (PROTECTED_FROM_FLUSH.has(table)) {
      return res.status(403).json({ error: `The "${table}" table can't be flushed through this tool — manage it from the Admin Access tab instead.` });
    }

    const { confirm } = req.body || {};
    if (confirm !== table) {
      return res.status(400).json({ error: `Type the table name exactly ("${table}") to confirm.` });
    }

    const allRows = db.prepare(`SELECT * FROM ${table}`).all();
    if (allRows.length > 0) {
      logUndo(table, 'flush', null, allRows);
    }

    const result = db.prepare(`DELETE FROM ${table}`).run();
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// --- List recent undoable actions ---
router.get('/undo-log', requireSuperAdmin, (req, res) => {
  const entries = db
    .prepare(
      `SELECT * FROM undo_log
       WHERE is_undone = 0 AND created_at >= datetime('now', '-${UNDO_WINDOW_HOURS} hours')
       ORDER BY created_at DESC LIMIT 50`
    )
    .all();

  const summarized = entries.map((entry) => {
    const snapshot = JSON.parse(entry.snapshot);
    const summary =
      entry.action === 'flush'
        ? `Deleted ${snapshot.length} row(s) from "${entry.table_name}"`
        : `Edited row #${entry.row_id} in "${entry.table_name}" (${Object.keys(snapshot).join(', ')})`;
    return {
      id: entry.id,
      table: entry.table_name,
      action: entry.action,
      rowId: entry.row_id,
      summary,
      createdAt: entry.created_at,
    };
  });

  res.json(summarized);
});

// --- Undo one logged action ---
router.post('/undo-log/:id/undo', requireSuperAdmin, (req, res) => {
  const entry = db.prepare('SELECT * FROM undo_log WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Nothing to undo — that entry was not found.' });
  if (entry.is_undone) return res.status(400).json({ error: 'This was already undone.' });

  try {
    const table = assertValidTable(entry.table_name);
    const currentColumns = getColumns(table);
    const snapshot = JSON.parse(entry.snapshot);

    if (entry.action === 'edit') {
      const stillExists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(entry.row_id);
      if (!stillExists) {
        return res.status(409).json({ error: 'That row no longer exists (it may have been deleted since), so this edit can\'t be restored.' });
      }
      const fields = Object.keys(snapshot).filter((f) => currentColumns.includes(f));
      if (fields.length === 0) {
        return res.status(409).json({ error: 'None of the changed fields still exist on this table — nothing to restore.' });
      }
      const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
      db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = @id`).run({
        ...Object.fromEntries(fields.map((f) => [f, snapshot[f]])),
        id: entry.row_id,
      });
    } else if (entry.action === 'flush') {
      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          const fields = Object.keys(row).filter((f) => currentColumns.includes(f));
          const placeholders = fields.map((f) => `@${f}`).join(', ');
          db.prepare(`INSERT OR IGNORE INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(row);
        }
      });
      insertMany(snapshot);
    }

    db.prepare('UPDATE undo_log SET is_undone = 1 WHERE id = ?').run(entry.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// --- Read-only query tool — SELECT statements only, everything else is rejected ---
router.post('/query', requireSuperAdmin, (req, res) => {
  const { sql } = req.body || {};
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'A SQL query is required.' });
  }

  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const isSingleStatement = !trimmed.includes(';');
  const isSelectOnly = /^select\b/i.test(trimmed);
  const hasWriteKeyword = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace)\b/i.test(trimmed);

  if (!isSingleStatement || !isSelectOnly || hasWriteKeyword) {
    return res.status(400).json({ error: 'Only a single SELECT statement is allowed here — use the row editor for changes.' });
  }

  try {
    const rows = db.prepare(trimmed).all();
    res.json({ rows: rows.map(redactRow), count: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Download a consistent backup of the whole database ---
router.get('/backup', requireSuperAdmin, (req, res) => {
  const tmpPath = path.join(require('os').tmpdir(), `rescue-backup-${Date.now()}.db`);
  try {
    // VACUUM INTO produces a clean, complete snapshot in one step — safe to
    // use even with WAL mode active, unlike copying the .db file directly
    // (which could miss data still sitting in the -wal file).
    db.prepare('VACUUM INTO ?').run(tmpPath);
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(tmpPath, `rescue-backup-${stamp}.db`, (err) => {
      fs.unlink(tmpPath, () => {}); // clean up the temp file regardless of success/failure
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Backup download failed.' });
      }
    });
  } catch (err) {
    fs.unlink(tmpPath, () => {});
    res.status(500).json({ error: err.message });
  }
});

// --- Server monitoring snapshot ---
router.get('/monitor', requireSuperAdmin, (req, res) => {
  const dbPath = process.env.DATABASE_PATH || './data/rescue.db';
  let dbSizeBytes = null;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch (err) {
    // file stat can fail in edge cases (e.g. path not found) — leave as null rather than erroring
  }

  res.json({
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    databaseSizeBytes: dbSizeBytes,
    databasePath: dbPath,
    serverTime: new Date().toISOString(),
  });
});

// --- Restart the server process ---
// Relies on the hosting platform's auto-restart-on-crash policy (Railway
// does this by default, but double check Settings → Deploy → Restart Policy
// is NOT set to "never" before relying on this). Exits with a non-zero code
// so it's treated as a crash/failure, not an intentional stop.
router.post('/restart', requireSuperAdmin, (req, res) => {
  res.json({ ok: true, message: 'Restarting now — this page will be unreachable for a few seconds.' });
  setTimeout(() => process.exit(1), 300);
});

module.exports = router;
