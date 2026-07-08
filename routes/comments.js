const express = require('express');
const db = require('../db');
const { attachIdentity } = require('../middleware/auth');

const router = express.Router();

router.delete('/:id', attachIdentity, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });

  const isOwner = req.user && req.user.id === comment.user_id;
  if (!isOwner && !req.admin) {
    return res.status(403).json({ error: 'Not allowed to delete this comment.' });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
