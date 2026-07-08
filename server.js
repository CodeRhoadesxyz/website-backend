require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const eventRoutes = require('./routes/events');
const announcementRoutes = require('./routes/announcements');
const birdRoutes = require('./routes/birds');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const statsRoutes = require('./routes/stats');
const adminUserRoutes = require('./routes/admin-users');
const donationRoutes = require('./routes/donations');
const volunteerRoutes = require('./routes/volunteers');
const auditLogRoutes = require('./routes/audit-log');
const maintenanceRoutes = require('./routes/maintenance');

const { attachIdentity } = require('./middleware/auth');
const { logFromRequest } = require('./lib/auditLog');
const { getStatus: getMaintenanceStatus } = require('./lib/maintenance');

const app = express();

// Railway/Render/Heroku-style platforms sit behind a reverse proxy that
// terminates HTTPS, so without this Express thinks every request is plain
// http — which breaks the same-origin check below (https://yourapp vs
// http://yourapp never match).
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback, req) {
      return callback(null, true);
    },
    credentials: true,
  })
);

// Custom origin check (placed after cors() so it can inspect the request):
// the admin portal and widgets both call this same backend, so same-origin
// requests are always allowed regardless of ALLOWED_ORIGINS. Cross-origin
// requests (e.g. your main site embedding the widgets) must be in the list.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) return next(); // non-browser requests (curl, server-to-server) have no Origin header

  const requestHost = `${req.protocol}://${req.get('host')}`;
  const isSameOrigin = origin === requestHost;
  const isAllowlisted = allowedOrigins.includes(origin);

  if (isSameOrigin || isAllowlisted) return next();

  return res.status(403).json({ error: 'This origin is not allowed to access the API.' });
});

app.use(express.json());
app.use(cookieParser());

// Populates req.admin / req.user whenever a valid cookie is present, without
// rejecting requests that don't have one. Both the audit log hook and the
// maintenance gate below rely on req.admin being set this early.
app.use(attachIdentity);

// --- Audit log: automatically records every state-changing request made by
// a signed-in admin (login/logout/reset are logged explicitly inside
// routes/auth.js instead, since those happen outside the usual req.admin
// flow). Listening on 'finish' means req.admin/req.params/req.route are
// already fully populated by the route handler that ran. ---
app.use((req, res, next) => {
  res.on('finish', () => {
    try {
      if (!req.admin) return; // not a signed-in admin action
      if (req.method === 'GET' || req.method === 'HEAD') return; // only log state changes
      if (res.statusCode >= 400) return; // only log actions that actually succeeded
      logFromRequest(req, res);
    } catch (err) {
      console.error('Failed to write audit log entry:', err);
    }
  });
  next();
});

// --- Maintenance mode gate ---
// Applies to /api/* AND /widgets/* — the embedded widgets are the public
// site's actual content (birds grid, blog, events, forms, etc.), so blocking
// them is what makes the live site go dark for a normal visitor. The admin
// panel's static files under /admin always keep loading regardless, since
// the panel itself needs to stay reachable so an admin can turn maintenance
// mode back off. Signed-in admins bypass this gate entirely everywhere else
// too, so they retain full use of both the API and the widgets while it's on.
//
// Two files are deliberately exempted even though they live under /widgets:
// shared.js and widgets.css. shared.js is the script responsible for
// detecting maintenance mode and covering the page with a full-screen block
// message in the first place — if we blocked it too, no visitor would ever
// see *why* the site went dark, they'd just see broken widgets. widgets.css
// supplies the styling that overlay uses.
//
// A short allowlist of public API endpoints also always stays reachable:
// health checks, the maintenance status endpoint itself (so shared.js can
// poll it and render the block/countdown), and the admin auth endpoints (so
// a signed-out admin can still log back in to turn maintenance mode off).
const MAINTENANCE_ALLOWLIST = new Set([
  '/api/health',
  '/api/maintenance/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/widgets/shared.js',
  '/widgets/widgets.css',
]);

app.use((req, res, next) => {
  const isGated = req.path.startsWith('/api') || req.path.startsWith('/widgets');
  if (!isGated) return next(); // /admin (and anything else) always loads
  if (req.admin) return next(); // signed-in admins are never blocked
  if (MAINTENANCE_ALLOWLIST.has(req.path)) return next();

  const status = getMaintenanceStatus();
  if (!status.active) return next();

  if (status.ends_at) {
    const secondsLeft = Math.max(0, Math.round((new Date(status.ends_at) - new Date()) / 1000));
    res.setHeader('Retry-After', String(secondsLeft));
  }

  // /widgets/* requests are loaded via <script src> / <link> tags, not read
  // as JSON — dumping a JSON body into those would just show up as a
  // harmless-but-messy console error (bad JS syntax / bad CSS). Send an
  // empty body instead; shared.js is the one that actually informs the
  // visitor, via the maintenance-status endpoint it's still allowed to poll.
  if (req.path.startsWith('/widgets')) {
    return res.status(503).end();
  }

  return res.status(503).json({
    error: status.message,
    maintenance: true,
    ends_at: status.ends_at,
    server_time: status.server_time,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/birds', birdRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin-users', adminUserRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/maintenance', maintenanceRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the admin dashboard (plain HTML/JS, no build step).
// Cache-Control: no-cache forces the browser to revalidate with the server
// on every load instead of silently serving a stale cached copy after a
// deploy — important here since these are hand-edited files that change
// fairly often.
const noCacheStatic = (dir) =>
  express.static(dir, {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  });

app.use('/admin', noCacheStatic(path.join(__dirname, 'public/admin')));

// Serve embeddable widget JS/CSS that the main website links to
app.use('/widgets', noCacheStatic(path.join(__dirname, 'public/widgets')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Heart & Soul Rescue backend running on port ${PORT}`);
});
