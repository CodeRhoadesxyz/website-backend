const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO audit_log (admin_id, admin_username, action, method, path, details, ip)
  VALUES (@admin_id, @admin_username, @action, @method, @path, @details, @ip)
`);

// Fields we never want to persist even if they show up in a request body
// (passwords, in particular — an audit trail should never become a place
// password history leaks to).
const REDACTED_FIELDS = ['password', 'password_hash', 'token', 'currentPassword', 'newPassword'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    if (REDACTED_FIELDS.includes(key)) continue;
    if (typeof value === 'string' && value.length > 300) {
      clean[key] = `${value.slice(0, 300)}…`; // keep entries compact
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
}

// Friendly, human-readable labels for the routes we know about, keyed by
// "METHOD /mounted/path/pattern" (using Express's own :param syntax, so this
// lines up with req.baseUrl + req.route.path). Anything not listed here
// still gets logged — just with a generic "METHOD /actual/path" action label
// instead of a friendly sentence — so no admin action ever goes unrecorded
// just because it's missing from this map.
const ROUTE_LABELS = {
  'POST /api/birds': (p, b) => `Added bird${b && b.name ? ` "${b.name}"` : ''}`,
  'PATCH /api/birds/:id': (p) => `Updated bird #${p.id}`,
  'DELETE /api/birds/:id': (p) => `Removed bird #${p.id}`,

  'POST /api/events': (p, b) => `Created event${b && b.title ? ` "${b.title}"` : ''}`,
  'PATCH /api/events/:id': (p) => `Updated event #${p.id}`,
  'DELETE /api/events/:id': (p) => `Deleted event #${p.id}`,

  'POST /api/announcements': (p, b) => `Created announcement${b && b.title ? ` "${b.title}"` : ''}`,
  'PATCH /api/announcements/:id': (p) => `Updated announcement #${p.id}`,
  'DELETE /api/announcements/:id': (p) => `Deleted announcement #${p.id}`,

  'POST /api/admin-users': (p, b) => `Created admin account${b && b.username ? ` "${b.username}"` : ''}`,
  'PATCH /api/admin-users/:id': (p) => `Updated admin account #${p.id}`,
  'DELETE /api/admin-users/:id': (p) => `Removed admin account #${p.id}`,

  'POST /api/applications/:id/claim': (p) => `Claimed application #${p.id}`,
  'POST /api/applications/:id/unclaim': (p) => `Unclaimed application #${p.id}`,
  'PATCH /api/applications/:id': (p, b) => `Updated application #${p.id}${b && b.status ? ` → ${b.status}` : ''}`,
  'DELETE /api/applications/:id': (p) => `Deleted application #${p.id}`,

  'PATCH /api/users/:id': (p, b) =>
    b && b.is_banned !== undefined
      ? `${b.is_banned ? 'Suspended' : 'Unsuspended'} community account #${p.id}`
      : `Updated community account #${p.id}`,
  'DELETE /api/users/:id': (p) => `Deleted community account #${p.id}`,

  'DELETE /api/comments/:id': (p) => `Deleted comment #${p.id}`,
  'DELETE /api/posts/:id': (p) => `Deleted post #${p.id}`,

  'POST /api/donations': () => `Logged a donation`,
  'PATCH /api/donations/:id': (p) => `Updated donation #${p.id}`,
  'DELETE /api/donations/:id': (p) => `Deleted donation #${p.id}`,

  'POST /api/volunteers': (p, b) => `Added volunteer${b && b.full_name ? ` "${b.full_name}"` : ''}`,
  'PATCH /api/volunteers/:id': (p) => `Updated volunteer #${p.id}`,
  'DELETE /api/volunteers/:id': (p) => `Removed volunteer #${p.id}`,
  'POST /api/volunteers/:id/fosters': (p) => `Assigned a foster bird to volunteer #${p.id}`,
  'PATCH /api/volunteers/fosters/:fosterId': (p) => `Updated foster record #${p.fosterId}`,
  'DELETE /api/volunteers/fosters/:fosterId': (p) => `Removed foster record #${p.fosterId}`,
  'POST /api/volunteers/:id/hours': (p) => `Logged hours for volunteer #${p.id}`,
  'DELETE /api/volunteers/hours/:hourId': (p) => `Deleted hours entry #${p.hourId}`,

  'PUT /api/maintenance': (p, b) => (b && b.enabled ? 'Enabled maintenance mode' : 'Disabled maintenance mode'),
};

function describeAction(req) {
  const routePattern = req.route ? req.route.path : req.path;
  const key = `${req.method} ${req.baseUrl}${routePattern}`;
  const builder = ROUTE_LABELS[key];
  if (builder) {
    try {
      return builder(req.params, req.body || {});
    } catch (err) {
      // fall through to generic label if a builder throws on odd input
    }
  }
  return `${req.method} ${req.originalUrl.split('?')[0]}`;
}

// Called automatically (via server.js's res.on('finish') hook) for every
// successful, state-changing request made by a signed-in admin.
function logFromRequest(req, res) {
  insertStmt.run({
    admin_id: req.admin ? req.admin.id : null,
    admin_username: req.admin ? req.admin.username : '',
    action: describeAction(req),
    method: req.method,
    path: req.originalUrl.split('?')[0],
    details: JSON.stringify(sanitizeBody(req.body) || {}),
    ip: clientIp(req),
  });
}

// Called explicitly from places that log outside the normal req.admin flow
// (login, logout, password reset — these happen before/without the usual
// requireAdmin middleware setting req.admin).
function logManual({ adminId = null, adminUsername = '', action, req, details }) {
  insertStmt.run({
    admin_id: adminId,
    admin_username: adminUsername,
    action,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    details: JSON.stringify(details || {}),
    ip: clientIp(req),
  });
}

module.exports = { logFromRequest, logManual };
