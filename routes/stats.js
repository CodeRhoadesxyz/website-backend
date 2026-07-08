const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const countByType = (type) => db.prepare('SELECT COUNT(*) as c FROM applications WHERE type = ?').get(type).c;
  const newCountByType = (type) =>
    db.prepare("SELECT COUNT(*) as c FROM applications WHERE type = ? AND status = 'new'").get(type).c;
  const rsvpCount = db.prepare('SELECT COUNT(*) as c FROM rsvps').get().c;

  res.json({
    adoption: { total: countByType('adoption'), new: newCountByType('adoption') },
    relinquishment: { total: countByType('relinquishment'), new: newCountByType('relinquishment') },
    volunteer: { total: countByType('volunteer'), new: newCountByType('volunteer') },
    rsvps: { total: rsvpCount },
  });
});

module.exports = router;
