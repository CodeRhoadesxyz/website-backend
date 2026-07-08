const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['active', 'inactive'];

router.use(requireAdmin);

// ---------- roster ----------

router.get('/', (req, res) => {
  const { status } = req.query;

  let query = `
    SELECT v.*,
      (SELECT COUNT(*) FROM foster_assignments fa WHERE fa.volunteer_id = v.id AND fa.end_date IS NULL) AS active_fosters,
      (SELECT COALESCE(SUM(hours), 0) FROM volunteer_hours vh WHERE vh.volunteer_id = v.id) AS total_hours
    FROM volunteers v
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    query += ' AND v.status = ?';
    params.push(status);
  }

  query += ' ORDER BY v.full_name ASC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

  const fosters = db
    .prepare(
      `SELECT fa.*, b.name AS bird_name, b.species AS bird_species, b.photo_url AS bird_photo_url
       FROM foster_assignments fa
       JOIN birds b ON b.id = fa.bird_id
       WHERE fa.volunteer_id = ?
       ORDER BY (fa.end_date IS NOT NULL), fa.start_date DESC`
    )
    .all(req.params.id);

  const hours = db
    .prepare('SELECT * FROM volunteer_hours WHERE volunteer_id = ? ORDER BY log_date DESC, id DESC')
    .all(req.params.id);

  const totalHours = hours.reduce((sum, h) => sum + h.hours, 0);

  res.json({ ...volunteer, fosters, hours, total_hours: totalHours });
});

router.post('/', (req, res) => {
  const { full_name, email, phone, status, skills, notes, application_id, joined_date } = req.body || {};

  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  const result = db
    .prepare(
      `INSERT INTO volunteers (full_name, email, phone, status, skills, notes, application_id, joined_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')))`
    )
    .run(
      full_name.trim(),
      email || '',
      phone || '',
      status || 'active',
      skills || '',
      notes || '',
      application_id || null,
      joined_date || null
    );

  const created = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Volunteer not found.' });

  if (req.body && 'status' in req.body && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }

  const fields = ['full_name', 'email', 'phone', 'status', 'skills', 'notes', 'joined_date'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) updates[field] = req.body[field];
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE volunteers SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });
  }

  const updated = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM volunteers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Volunteer not found.' });
  res.json({ ok: true });
});

// ---------- foster assignments ----------

router.post('/:id/fosters', (req, res) => {
  const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

  const { bird_id, start_date, notes } = req.body || {};
  if (!bird_id) return res.status(400).json({ error: 'A bird must be selected.' });

  const bird = db.prepare('SELECT * FROM birds WHERE id = ?').get(bird_id);
  if (!bird) return res.status(404).json({ error: 'Bird not found.' });

  const result = db
    .prepare(
      `INSERT INTO foster_assignments (volunteer_id, bird_id, start_date, notes)
       VALUES (?, ?, COALESCE(?, date('now')), ?)`
    )
    .run(req.params.id, bird_id, start_date || null, notes || '');

  const created = db
    .prepare(
      `SELECT fa.*, b.name AS bird_name, b.species AS bird_species, b.photo_url AS bird_photo_url
       FROM foster_assignments fa JOIN birds b ON b.id = fa.bird_id WHERE fa.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/fosters/:fosterId', (req, res) => {
  const existing = db.prepare('SELECT * FROM foster_assignments WHERE id = ?').get(req.params.fosterId);
  if (!existing) return res.status(404).json({ error: 'Foster assignment not found.' });

  const fields = ['start_date', 'end_date', 'notes'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) updates[field] = req.body[field];
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE foster_assignments SET ${setClause} WHERE id = @id`).run({
      ...updates,
      id: req.params.fosterId,
    });
  }

  const updated = db
    .prepare(
      `SELECT fa.*, b.name AS bird_name, b.species AS bird_species, b.photo_url AS bird_photo_url
       FROM foster_assignments fa JOIN birds b ON b.id = fa.bird_id WHERE fa.id = ?`
    )
    .get(req.params.fosterId);
  res.json(updated);
});

router.delete('/fosters/:fosterId', (req, res) => {
  const result = db.prepare('DELETE FROM foster_assignments WHERE id = ?').run(req.params.fosterId);
  if (result.changes === 0) return res.status(404).json({ error: 'Foster assignment not found.' });
  res.json({ ok: true });
});

// ---------- hours log ----------

router.post('/:id/hours', (req, res) => {
  const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

  const { log_date, hours, activity } = req.body || {};
  const hoursNum = Number(hours);
  if (!log_date) return res.status(400).json({ error: 'Date is required.' });
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ error: 'Hours must be a positive number.' });
  }

  const result = db
    .prepare('INSERT INTO volunteer_hours (volunteer_id, log_date, hours, activity) VALUES (?, ?, ?, ?)')
    .run(req.params.id, log_date, hoursNum, activity || '');

  const created = db.prepare('SELECT * FROM volunteer_hours WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.delete('/hours/:hourId', (req, res) => {
  const result = db.prepare('DELETE FROM volunteer_hours WHERE id = ?').run(req.params.hourId);
  if (result.changes === 0) return res.status(404).json({ error: 'Hours entry not found.' });
  res.json({ ok: true });
});

module.exports = router;
