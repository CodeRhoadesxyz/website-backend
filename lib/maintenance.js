const db = require('../db');

const getRow = db.prepare('SELECT * FROM maintenance_mode WHERE id = 1');
const updateStmt = db.prepare(`
  UPDATE maintenance_mode
  SET enabled = @enabled, message = @message, starts_at = @starts_at, ends_at = @ends_at,
      updated_by = @updated_by, updated_at = datetime('now')
  WHERE id = 1
`);
const disableStmt = db.prepare(`
  UPDATE maintenance_mode SET enabled = 0, updated_at = datetime('now') WHERE id = 1
`);

// Reads the stored settings and works out what's actually true *right now*:
// - enabled=0                       -> off
// - enabled=1, starts_at in future  -> scheduled (not blocking yet)
// - enabled=1, ends_at in the past  -> the window lapsed; auto-turn off so
//                                      the toggle doesn't lie to the admin
//                                      panel, and treat as off for this request
// - enabled=1, otherwise            -> active (blocking)
function getStatus() {
  const row = getRow.get();
  const now = new Date();
  const startsAt = row.starts_at ? new Date(row.starts_at) : null;
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;

  let active = false;
  let scheduled = false;

  if (row.enabled) {
    if (endsAt && now > endsAt) {
      disableStmt.run();
      row.enabled = 0;
    } else if (startsAt && now < startsAt) {
      scheduled = true;
    } else {
      active = true;
    }
  }

  return {
    enabled: !!row.enabled,
    active,
    scheduled,
    message: row.message,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
    server_time: now.toISOString(),
  };
}

function setStatus({ enabled, message, starts_at, ends_at, updatedBy }) {
  updateStmt.run({
    enabled: enabled ? 1 : 0,
    message: message && message.trim() ? message.trim() : "We're currently performing scheduled maintenance. Please check back soon.",
    starts_at: starts_at || null,
    ends_at: ends_at || null,
    updated_by: updatedBy || null,
  });
  return getStatus();
}

module.exports = { getStatus, setStatus };
