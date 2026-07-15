const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { notifyAdminNewRsvp } = require('../lib/mailer');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.get('/', (req, res) => {
  const { includePast, all } = req.query;

  let query = 'SELECT * FROM events WHERE is_published = 1';
  if (!includePast) {
    query += " AND datetime(start_time) >= datetime('now')";
  }
  query += ' ORDER BY start_time ASC';

  if (all === '1') {
    query = 'SELECT * FROM events ORDER BY start_time ASC';
  }

  const events = db.prepare(query).all();

  const withCounts = events.map((event) => {
    const { total } = db
      .prepare('SELECT COALESCE(SUM(1 + guests), 0) as total FROM rsvps WHERE event_id = ?')
      .get(event.id);
    return { ...event, rsvp_count: total };
  });

  res.json(withCounts);
});

router.get('/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event || !event.is_published) return res.status(404).json({ error: 'Event not found.' });
  res.json(event);
});

router.post('/:id/rsvp', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event || !event.is_published) return res.status(404).json({ error: 'Event not found.' });

  const { name, email, phone, guests, notes } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const guestCount = Number.isFinite(Number(guests)) ? Math.max(0, parseInt(guests, 10)) : 0;

  if (event.capacity != null) {
    const { total } = db
      .prepare('SELECT COALESCE(SUM(1 + guests), 0) as total FROM rsvps WHERE event_id = ?')
      .get(event.id);
    if (total + 1 + guestCount > event.capacity) {
      return res.status(409).json({ error: 'This event is full.' });
    }
  }

  const result = db
    .prepare('INSERT INTO rsvps (event_id, name, email, phone, guests, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(event.id, name, email, phone || '', guestCount, notes || '');

  notifyAdminNewRsvp(event, { name, email, phone: phone || '', guests: guestCount, notes: notes || '' });

  res.status(201).json({ id: result.lastInsertRowid, message: 'RSVP received.' });
});

router.post('/', requireAdmin, (req, res) => {
  const { title, description, location, start_time, end_time, image_url, capacity, is_published } =
    req.body || {};

  if (!title || !start_time) {
    return res.status(400).json({ error: 'Title and start_time are required.' });
  }

  const result = db
    .prepare(
      `INSERT INTO events (title, description, location, start_time, end_time, image_url, capacity, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      description || '',
      location || '',
      start_time,
      end_time || null,
      image_url || '',
      capacity ?? null,
      is_published === false ? 0 : 1
    );

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  logActivity(req.admin, 'events', 'create', created.id, created);
  res.status(201).json(created);
});

router.patch('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Event not found.' });

  const fields = ['title', 'description', 'location', 'start_time', 'end_time', 'image_url', 'capacity', 'is_published'];
  const updates = {};
  for (const field of fields) {
    if (field in (req.body || {})) {
      let value = req.body[field];
      if (field === 'is_published') value = value ? 1 : 0;
      updates[field] = value;
    }
  }

  const setClause = Object.keys(updates)
    .map((field) => `${field} = @${field}`)
    .join(', ');

  if (setClause) {
    db.prepare(`UPDATE events SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });

    const before = {};
    Object.keys(updates).forEach((field) => { before[field] = existing[field]; });
    logActivity(req.admin, 'events', 'edit', existing.id, before);
  }

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Event not found.' });

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  logActivity(req.admin, 'events', 'delete', existing.id, existing);
  res.json({ ok: true });
});

router.get('/:id/rsvps', requireAdmin, (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const rsvps = db.prepare('SELECT * FROM rsvps WHERE event_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(rsvps);
});

module.exports = router;
