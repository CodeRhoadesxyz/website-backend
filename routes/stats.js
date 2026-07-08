const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const countByType = (type) => db.prepare('SELECT COUNT(*) as c FROM applications WHERE type = ?').get(type).c;
  const newCountByType = (type) =>
    db.prepare("SELECT COUNT(*) as c FROM applications WHERE type = ? AND status = 'new'").get(type).c;
  const rsvpCount = db.prepare('SELECT COUNT(*) as c FROM rsvps').get().c;

  const donationsThisMonth = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE donation_date >= date('now', 'start of month')`)
    .get().total;
  const donationsAllTime = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM donations').get().total;
  const activeVolunteers = db.prepare(`SELECT COUNT(*) as c FROM volunteers WHERE status = 'active'`).get().c;
  const activeFosters = db.prepare('SELECT COUNT(*) as c FROM foster_assignments WHERE end_date IS NULL').get().c;

  res.json({
    adoption: { total: countByType('adoption'), new: newCountByType('adoption') },
    relinquishment: { total: countByType('relinquishment'), new: newCountByType('relinquishment') },
    volunteer: { total: countByType('volunteer'), new: newCountByType('volunteer') },
    rsvps: { total: rsvpCount },
    donations: { this_month: donationsThisMonth, all_time: donationsAllTime },
    volunteers: { active: activeVolunteers, active_fosters: activeFosters },
  });
});

module.exports = router;
