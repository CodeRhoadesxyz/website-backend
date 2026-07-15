const express = require('express');
const db = require('../db');
const { requireAdmin, requireUser, attachIdentity, hasTabPermission } = require('../middleware/auth');
const { notifyAdminNewApplication } = require('../lib/mailer');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

const VALID_TYPES = ['adoption', 'relinquishment', 'volunteer'];
const VALID_STATUSES = ['new', 'in_review', 'needs_info', 'approved', 'declined', 'archived'];

// Applications don't have their own "tab" in the permission system — each
// type (adoption/relinquishment/volunteer) IS its own tab, matching the
// three separate sidebar entries in the admin panel. For routes keyed by
// :id, the type has to be looked up first since it isn't in the URL.
function requireApplicationTypeAccess(req, res, next) {
  if (!req.admin) return next(); // applicant-facing paths handle their own auth separately
  const action = ['GET', 'HEAD'].includes(req.method) ? 'view' : 'edit';

  let type = req.query.type;
  if (!type && req.params.id) {
    const row = db.prepare('SELECT type FROM applications WHERE id = ?').get(req.params.id);
    if (!row) return next(); // let the route's own 404 handling report this
    type = row.type;
  }
  if (!type || !VALID_TYPES.includes(type)) return next(); // route's own validation will reject an unknown/missing type

  const adminRow = db.prepare('SELECT username, tab_permissions FROM admins WHERE id = ?').get(req.admin.id);
  if (!adminRow || !hasTabPermission(adminRow, type, action)) {
    return res.status(403).json({ error: `You don't have access to ${type} applications. Ask your super admin for access.` });
  }
  next();
}

const REQUIRED_FIELDS = {
  adoption: ['fullName', 'email', 'phone'],
  relinquishment: ['fullName', 'email', 'phone', 'birdSpecies'],
  volunteer: ['fullName', 'email', 'phone', 'interests'],
};

function validateBody(type, body) {
  const required = REQUIRED_FIELDS[type];
  const missing = required.filter((field) => !body[field] || String(body[field]).trim() === '');
  return missing;
}

// attachIdentity is non-blocking — if the person happens to be logged in
// (their blog/applications account) when they submit, the application gets
// linked to their account automatically so it shows up in "My
// Applications" later. If they're not logged in, the submission still goes
// through exactly as before, just without that link.
router.post('/:type', attachIdentity, (req, res) => {
  const { type } = req.params;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Unknown application type.' });
  }

  const body = req.body || {};
  const missing = validateBody(type, body);

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const stmt = db.prepare('INSERT INTO applications (type, data, user_id) VALUES (?, ?, ?)');
  const result = stmt.run(type, JSON.stringify(body), req.user ? req.user.id : null);

  // Fire-and-forget: the application is already saved regardless of whether
  // this email succeeds, and mailer.js itself swallows/logs any failure.
  notifyAdminNewApplication(type, body);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Application received.' });
});

// --- A logged-in applicant's own applications ---
// Deliberately excludes admin_notes (internal-only) and must be registered
// before GET /:id below, or Express would try to match "mine" as an :id.
router.get('/mine', requireUser, (req, res) => {
  const rows = db
    .prepare('SELECT id, type, status, data, created_at, updated_at FROM applications WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows.map((row) => ({ ...row, data: JSON.parse(row.data) })));
});

router.get('/', requireAdmin, requireApplicationTypeAccess, (req, res) => {
  const { type, status, search } = req.query;

  let query = 'SELECT * FROM applications WHERE 1=1';
  const params = [];

  if (type) {
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown application type.' });
    query += ' AND type = ?';
    params.push(type);
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    query += ' AND status = ?';
    params.push(status);
  }

  if (search && search.trim()) {
    query += ' AND data LIKE ?';
    params.push(`%${search.trim()}%`);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params);
  const applications = rows.map((row) => ({ ...row, data: JSON.parse(row.data) }));

  res.json(applications);
});

router.get('/:id', requireAdmin, requireApplicationTypeAccess, (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

router.patch('/:id', requireAdmin, requireApplicationTypeAccess, (req, res) => {
  const { status, admin_notes } = req.body || {};
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  db.prepare(
    `UPDATE applications SET
       status = COALESCE(?, status),
       admin_notes = COALESCE(?, admin_notes),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(status || null, admin_notes ?? null, req.params.id);

  const before = {};
  if (status) before.status = row.status;
  if (admin_notes !== undefined) before.admin_notes = row.admin_notes;
  if (Object.keys(before).length > 0) {
    logActivity(req.admin, 'applications', 'edit', row.id, before);
  }

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json({ ...updated, data: JSON.parse(updated.data) });
});

router.delete('/:id', requireAdmin, requireApplicationTypeAccess, (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });

  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'applications', 'delete', row.id, row);
  res.json({ ok: true });
});

// --- Messages: a chat thread attached to one application ---
// Readable/writable by an admin (any admin) or the applicant who owns it
// (only if the application was linked to their account at submission time —
// see the attachIdentity note on POST /:type above).
function canAccessApplication(req, application) {
  if (req.admin) return true;
  if (req.user && application.user_id === req.user.id) return true;
  return false;
}

router.get('/:id/messages', attachIdentity, requireApplicationTypeAccess, (req, res) => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  if (!canAccessApplication(req, application)) {
    return res.status(403).json({ error: 'Not allowed to view this conversation.' });
  }

  const messages = db
    .prepare('SELECT * FROM application_messages WHERE application_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json(messages);
});

router.post('/:id/messages', attachIdentity, requireApplicationTypeAccess, (req, res) => {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  if (!canAccessApplication(req, application)) {
    return res.status(403).json({ error: 'Not allowed to message on this application.' });
  }

  const { body } = req.body || {};
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  // An admin replying always logs as 'admin', even in the unlikely case the
  // same browser also happens to have a valid applicant session — admin
  // identity takes priority since this is almost always called from the
  // admin panel when req.admin is present.
  const senderType = req.admin ? 'admin' : 'applicant';
  const senderId = req.admin ? req.admin.id : req.user.id;
  const senderName = req.admin ? req.admin.username : (db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id) || {}).display_name || 'Applicant';

  const result = db
    .prepare('INSERT INTO application_messages (application_id, sender_type, sender_id, sender_name, body) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, senderType, senderId, senderName, body.trim());

  // Applications automatically move to "In review" once a real conversation
  // starts, if they were still sitting untouched as "New" — a small but
  // useful signal that something's actually happening on this application.
  if (senderType === 'admin' && application.status === 'new') {
    db.prepare(`UPDATE applications SET status = 'in_review', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  }

  const created = db.prepare('SELECT * FROM application_messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

module.exports = router;
