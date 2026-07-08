const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { getStatus, setStatus } = require('../lib/maintenance');

const router = express.Router();

// Public, unauthenticated, and never blocked by maintenance mode itself
// (see the gate in server.js) — this is what the widgets/banner on the main
// site poll to know whether to show a maintenance notice and countdown.
router.get('/status', (req, res) => {
  const status = getStatus();
  res.json({
    active: status.active,
    scheduled: status.scheduled,
    message: status.message,
    starts_at: status.starts_at,
    ends_at: status.ends_at,
    server_time: status.server_time,
  });
});

// Full settings, admin-only (includes who last changed it, etc.)
router.get('/', requireAdmin, (req, res) => {
  res.json(getStatus());
});

router.put('/', requireAdmin, (req, res) => {
  const { enabled, message, starts_at, ends_at } = req.body || {};

  if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) {
    return res.status(400).json({ error: 'The end time must be after the start time.' });
  }

  const status = setStatus({
    enabled: !!enabled,
    message,
    starts_at: starts_at || null,
    ends_at: ends_at || null,
    updatedBy: req.admin.id,
  });

  res.json(status);
});

module.exports = router;
