const express = require('express');
const db = require('../db');

const router = express.Router();

// --- Public: high-level impact numbers for the "Our Impact" widget ---
router.get('/', (req, res) => {
  const totalBirds = db.prepare('SELECT COUNT(*) as c FROM birds').get().c;
  const adoptedBirds = db.prepare("SELECT COUNT(*) as c FROM birds WHERE status = 'adopted'").get().c;
  const eventsHosted = db.prepare('SELECT COUNT(*) as c FROM events').get().c;
  const volunteerApplications = db.prepare("SELECT COUNT(*) as c FROM applications WHERE type = 'volunteer'").get().c;

  res.json({
    birdsAdopted: adoptedBirds,
    totalBirdsHelped: totalBirds,
    adoptionRate: totalBirds > 0 ? Math.round((adoptedBirds / totalBirds) * 100) : 0,
    eventsHosted,
    volunteersEngaged: volunteerApplications,
  });
});

module.exports = router;
