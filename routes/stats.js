const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const countByType = (type) => db.prepare('SELECT COUNT(*) as c FROM applications WHERE type = ?').get(type).c;
  const newCountByType = (type) =>
    db.prepare("SELECT COUNT(*) as c FROM applications WHERE type = ? AND status = 'new'").get(type).c;
  const rsvpCount = db.prepare('SELECT COUNT(*) as c FROM rsvps').get().c;

  const totalBirds = db.prepare('SELECT COUNT(*) as c FROM birds').get().c;
  const adoptedBirds = db.prepare("SELECT COUNT(*) as c FROM birds WHERE status = 'adopted'").get().c;
  const availableBirds = db.prepare("SELECT COUNT(*) as c FROM birds WHERE status = 'available'").get().c;
  const pendingBirds = db.prepare("SELECT COUNT(*) as c FROM birds WHERE status = 'pending'").get().c;

  // Approximate — updated_at reflects the bird record's most recent edit, not
  // necessarily the exact moment status flipped to "adopted," but it's a
  // reasonable proxy without adding a dedicated status-history table.
  const avgDaysRow = db
    .prepare(
      `SELECT AVG(julianday(updated_at) - julianday(created_at)) as avg_days
       FROM birds WHERE status = 'adopted'`
    )
    .get();

  res.json({
    adoption: { total: countByType('adoption'), new: newCountByType('adoption') },
    relinquishment: { total: countByType('relinquishment'), new: newCountByType('relinquishment') },
    volunteer: { total: countByType('volunteer'), new: newCountByType('volunteer') },
    rsvps: { total: rsvpCount },
    birds: {
      total: totalBirds,
      adopted: adoptedBirds,
      available: availableBirds,
      pending: pendingBirds,
      adoptionRate: totalBirds > 0 ? Math.round((adoptedBirds / totalBirds) * 100) : 0,
      avgDaysToAdoption: avgDaysRow.avg_days != null ? Math.round(avgDaysRow.avg_days) : null,
    },
  });
});

module.exports = router;
