const express = require('express');
const db = require('../db');
const { requireUser, attachIdentity } = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');

const router = express.Router();

// Only these admin-assigned roles (see the Community tab in admin) can create
// new posts. Anyone signed up can still comment on any post regardless of
// role — this only gates who can start a new thread.
const POSTER_ROLES = ['founder', 'vice president', 'website developer'];

function canPost(user) {
  return Boolean(user.role) && POSTER_ROLES.includes(user.role.trim().toLowerCase());
}

function excerpt(body, len = 220) {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len).trim() + '…' : clean;
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.body, p.created_at, p.user_id,
              u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
       FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC`
    )
    .all();

  const withExcerpt = rows.map((r) => ({ ...r, excerpt: excerpt(r.body) }));
  res.json(withExcerpt);
});

router.get('/:id', (req, res) => {
  const post = db
    .prepare(
      `SELECT p.*, u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    )
    .get(req.params.id);

  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const comments = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`
    )
    .all(req.params.id);

  res.json({ ...post, comments });
});

router.post('/', requireUser, (req, res) => {
  if (!canPost(req.user)) {
    return res.status(403).json({
      error: 'Only Founders, Vice Presidents, and Website Developers can create new posts. Everyone can comment though!',
    });
  }

  const { title, body } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }

  const result = db
    .prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)')
    .run(req.user.id, title, body);

  const created = db
    .prepare(
      `SELECT p.*, u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json({ ...created, comments: [] });
});

router.patch('/:id', requireUser, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own posts.' });
  }

  const { title, body } = req.body || {};
  db.prepare(
    `UPDATE posts SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = datetime('now') WHERE id = ?`
  ).run(title || null, body || null, req.params.id);

  const updated = db
    .prepare(`SELECT p.*, u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`)
    .get(req.params.id);
  res.json(updated);
});

router.delete('/:id', attachIdentity, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const isOwner = req.user && req.user.id === post.user_id;
  if (!isOwner && !req.admin) {
    return res.status(403).json({ error: 'Not allowed to delete this post.' });
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  if (req.admin) {
    logActivity(req.admin, 'posts', 'delete', post.id, post);
  }
  res.json({ ok: true });
});

router.post('/:id/comments', requireUser, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const { body } = req.body || {};
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Comment cannot be empty.' });
  }

  const result = db
    .prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, body.trim());

  const created = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.display_name as author_name, u.avatar_url as author_avatar, u.role as author_role
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json(created);
});

module.exports = router;
