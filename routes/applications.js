const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendNewApplicationNotification } = require('../lib/email');

const router = express.Router();

// Comma-separated list of addresses to notify on every new application.
// Falls back to every admin's email on file if not set.
const NOTIFICATION_EMAILS = (process.env.APPLICATION_NOTIFICATION_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || '';

function getNotificationRecipients() {
  if (NOTIFICATION_EMAILS.length > 0) return NOTIFICATION_EMAILS;
  return db
    .prepare(`SELECT email FROM admins WHERE email IS NOT NULL AND email != ''`)
    .all()
    .map((row) => row.email);
}

const VALID_TYPES = ['adoption', 'relinquishment', 'volunteer'];
const VALID_STATUSES = ['new', 'in_review', 'approved', 'declined', 'archived'];

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

router.post('/:type', (req, res) => {
  const { type } = req.params;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Unknown application type.' });
  }

  const body = req.body || {};
  const missing = validateBody(type, body);

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const stmt = db.prepare('INSERT INTO applications (type, data) VALUES (?, ?)');
  const result = stmt.run(type, JSON.stringify(body));

  // Respond to the applicant immediately — don't make them wait on an email
  // round-trip. The notification is fire-and-forget; if it fails, it's
  // logged in lib/email.js but doesn't affect the application being saved.
  res.status(201).json({ id: result.lastInsertRowid, message: 'Application received.' });

  const recipients = getNotificationRecipients();
  if (recipients.length > 0) {
    sendNewApplicationNotification({
      to: recipients,
      type,
      applicantName: body.fullName || 'Someone',
      applicationId: result.lastInsertRowid,
      adminUrl: `${ADMIN_BASE_URL}/admin/index.html`,
    }).catch((err) => console.error('[applications] notification email failed:', err));
  }
});

router.get('/', requireAdmin, (req, res) => {
  const { type, status } = req.query;

  let query = `
    SELECT a.*, ad.username AS claimed_by_username
    FROM applications a
    LEFT JOIN admins ad ON ad.id = a.claimed_by
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown application type.' });
    query += ' AND a.type = ?';
    params.push(type);
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    query += ' AND a.status = ?';
    params.push(status);
  }

  query += ' ORDER BY a.created_at DESC';

  const rows = db.prepare(query).all(...params);
  const applications = rows.map((row) => ({ ...row, data: JSON.parse(row.data) }));

  res.json(applications);
});

router.get('/:id', requireAdmin, (req, res) => {
  const row = db
    .prepare(
      `SELECT a.*, ad.username AS claimed_by_username
       FROM applications a
       LEFT JOIN admins ad ON ad.id = a.claimed_by
       WHERE a.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

// Claim an application so other admins can see someone's already on it and
// avoid double-contacting the applicant. Re-claiming by the same admin who
// already holds it just refreshes claimed_at; claiming something someone
// else holds is rejected (409) rather than silently stealing it.
router.post('/:id/claim', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });

  if (row.claimed_by && row.claimed_by !== req.admin.id) {
    const claimant = db.prepare('SELECT username FROM admins WHERE id = ?').get(row.claimed_by);
    return res.status(409).json({ error: `Already claimed by ${claimant ? claimant.username : 'another admin'}.` });
  }

  db.prepare(`UPDATE applications SET claimed_by = ?, claimed_at = datetime('now') WHERE id = ?`).run(
    req.admin.id,
    req.params.id
  );

  const updated = db
    .prepare(
      `SELECT a.*, ad.username AS claimed_by_username
       FROM applications a LEFT JOIN admins ad ON ad.id = a.claimed_by WHERE a.id = ?`
    )
    .get(req.params.id);
  res.json({ ...updated, data: JSON.parse(updated.data) });
});

// Any admin can release a claim, not just the one who made it — this is a
// small trusted team and someone should always be able to un-stick a claim
// left by a colleague who's away, rather than needing that person specifically.
router.post('/:id/unclaim', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Application not found.' });

  db.prepare(`UPDATE applications SET claimed_by = NULL, claimed_at = NULL WHERE id = ?`).run(req.params.id);

  const updated = db
    .prepare(
      `SELECT a.*, ad.username AS claimed_by_username
       FROM applications a LEFT JOIN admins ad ON ad.id = a.claimed_by WHERE a.id = ?`
    )
    .get(req.params.id);
  res.json({ ...updated, data: JSON.parse(updated.data) });
});

router.patch('/:id', requireAdmin, (req, res) => {
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

  const updated = db
    .prepare(
      `SELECT a.*, ad.username AS claimed_by_username
       FROM applications a LEFT JOIN admins ad ON ad.id = a.claimed_by WHERE a.id = ?`
    )
    .get(req.params.id);
  res.json({ ...updated, data: JSON.parse(updated.data) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ok: true });
});

module.exports = router;
