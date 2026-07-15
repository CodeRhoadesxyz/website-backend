const express = require('express');
const db = require('../db');
const { attachIdentity, hasTabPermission } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

router.delete('/:id', attachIdentity, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });

  const isOwner = req.user && req.user.id === comment.user_id;
  if (!isOwner && !req.admin) {
    return res.status(403).json({ error: 'Not allowed to delete this comment.' });
  }

  if (!isOwner && req.admin) {
    const adminRow = db.prepare('SELECT username, tab_permissions FROM admins WHERE id = ?').get(req.admin.id);
    if (!adminRow || !hasTabPermission(adminRow, 'community', 'edit')) {
      return res.status(403).json({ error: "You don't have access to moderate Community. Ask your super admin for access." });
    }
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  if (req.admin) {
    logActivity(req.admin, 'comments', 'delete', comment.id, comment);
  }
  res.json({ ok: true });
});

module.exports = router;
