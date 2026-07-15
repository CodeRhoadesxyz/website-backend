const db = require('../db');

// Records one admin's action so it can be reviewed and, if needed, undone
// later from the Admin Access tab. `snapshot` should be:
//   - for 'edit': the row's PREVIOUS values for just the fields being changed
//   - for 'delete': the full row as it existed right before deletion
//   - for 'create': the full row as it was just created (so undo = delete it)
function logActivity(admin, table, action, rowId, snapshot) {
  db.prepare(
    `INSERT INTO activity_log (admin_id, admin_username, table_name, action, row_id, snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(admin.id, admin.username, table, action, rowId, JSON.stringify(snapshot));
}

function summarizeActivity(entry) {
  const snapshot = JSON.parse(entry.snapshot);
  const label = entry.table_name.replace(/_/g, ' ');
  if (entry.action === 'create') return `Created a new ${label} entry (#${entry.row_id})`;
  if (entry.action === 'delete') return `Deleted a ${label} entry (#${entry.row_id})`;
  return `Edited ${label} #${entry.row_id} (${Object.keys(snapshot).join(', ')})`;
}

module.exports = { logActivity, summarizeActivity };
