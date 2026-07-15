const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = { id: payload.id, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// For the community blog's regular (non-admin) user accounts. Deliberately a
// separate cookie/secret payload shape from admin auth, so a blog account can
// never be mistaken for an admin session or vice versa.
function requireUser(req, res, next) {
  const token = req.cookies && req.cookies.user_token;

  if (!token) {
    return res.status(401).json({ error: 'Please sign in to do that.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, username, display_name, avatar_url, role, email, is_banned FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    if (user.is_banned) return res.status(403).json({ error: 'This account has been suspended.' });
    req.user = { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role, email: user.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// Non-blocking version of the above two: populates req.user / req.admin if
// either cookie is present and valid, but never rejects the request either
// way.
function attachIdentity(req, res, next) {
  const userToken = req.cookies && req.cookies.user_token;
  const adminToken = req.cookies && req.cookies.admin_token;

  if (userToken) {
    try {
      const payload = jwt.verify(userToken, process.env.JWT_SECRET);
      const user = db.prepare('SELECT id, username, display_name, avatar_url, role, email, is_banned FROM users WHERE id = ?').get(payload.id);
      if (user && !user.is_banned) {
        req.user = { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role, email: user.email };
      }
    } catch (err) {
      // invalid/expired — just leave req.user unset
    }
  }

  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, process.env.JWT_SECRET);
      req.admin = { id: payload.id, username: payload.username };
    } catch (err) {
      // invalid/expired — just leave req.admin unset
    }
  }

  next();
}

// For the Database tools panel — restricted to one specific admin account
// (set via SUPER_ADMIN_USERNAME), regardless of how many other admins exist.
// Deliberately layered on top of requireAdmin rather than being its own
// separate login, so it's still the same admin session/cookie underneath.
// requireAdmin ends the response itself on failure (401) without calling
// next(), so this callback only ever runs after a successful admin check.
function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
    if (!superUsername) {
      return res.status(503).json({ error: 'Database tools are not configured (SUPER_ADMIN_USERNAME is not set).' });
    }
    if (req.admin.username.toLowerCase() !== superUsername) {
      return res.status(403).json({ error: 'This area is restricted.' });
    }
    next();
  });
}

// --- Per-tab admin permissions ---
// Every tab in the admin sidebar that isn't the Admin Access tab itself
// (that one is hardcoded to the super admin only, below — it's not
// something even the super admin can hand out, since it would let an admin
// grant themselves more access). Kept as a flat whitelist so a bad/old
// tab_permissions value can never grant access to something that isn't a
// real tab.
const ALL_TABS = [
  'adoption', 'relinquishment', 'volunteer',
  'birds', 'fosters', 'events', 'announcements',
  'wishlist', 'testimonials', 'faqs', 'store', 'community',
];

function isSuperAdminUsername(username) {
  const superUsername = (process.env.SUPER_ADMIN_USERNAME || '').toLowerCase();
  return Boolean(superUsername) && String(username || '').toLowerCase() === superUsername;
}

function parseTabPermissions(raw) {
  if (!raw) return null; // null = unrestricted (full access to everything)
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null; // corrupt value fails open to "unrestricted" rather than locking someone out
  }
}

// adminRow just needs { username, tab_permissions } — callers usually pull
// this fresh from the DB rather than trusting the JWT payload, since
// permissions can change after the token was issued.
function hasTabPermission(adminRow, tab, action) {
  if (isSuperAdminUsername(adminRow.username)) return true;
  const perms = parseTabPermissions(adminRow.tab_permissions);
  if (!perms) return true; // nobody has restricted this admin yet
  const entry = perms[tab];
  if (!entry) return true; // this specific tab was never restricted
  return action === 'view' ? entry.view !== false : entry.edit !== false;
}

// Mount as a route-level middleware after requireAdmin, e.g.:
//   router.patch('/:id', requireAdmin, requireTabPermission('birds'), handler)
// GET/HEAD requests check "view" access; everything else checks "edit".
function requireTabPermission(tab) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Not signed in.' });
    const adminRow = db.prepare('SELECT username, tab_permissions FROM admins WHERE id = ?').get(req.admin.id);
    if (!adminRow) return res.status(401).json({ error: 'Session invalid.' });
    const action = ['GET', 'HEAD'].includes(req.method) ? 'view' : 'edit';
    if (!hasTabPermission(adminRow, tab, action)) {
      return res.status(403).json({ error: `You don't have access to ${tab}. Ask your super admin for access.` });
    }
    next();
  };
}

module.exports = {
  requireAdmin,
  requireUser,
  attachIdentity,
  requireSuperAdmin,
  requireTabPermission,
  hasTabPermission,
  isSuperAdminUsername,
  ALL_TABS,
};
