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
const { router: uploadRoutes, uploadsDir } = require('./routes/upload');
const fosterRoutes = require('./routes/fosters');
const wishlistRoutes = require('./routes/wishlist');
const testimonialRoutes = require('./routes/testimonials');
const waitlistRoutes = require('./routes/waitlist');
const faqRoutes = require('./routes/faqs');
const storeRoutes = require('./routes/store');
const impactRoutes = require('./routes/impact');
const dbAdminRoutes = require('./routes/db-admin');

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
app.use('/api/upload', uploadRoutes);
app.use('/api/fosters', fosterRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/db-admin', dbAdminRoutes);

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

// Serve the database tools panel (Dalton-only, enforced server-side by
// requireSuperAdmin on every API call it makes — serving the static files
// themselves isn't the actual security boundary, the API checks are).
app.use('/superadmin', noCacheStatic(path.join(__dirname, 'public/superadmin')));

// Serve uploaded images (birds/events/announcements). These are static
// files that never change once uploaded, so normal caching is fine here —
// unlike the hand-edited admin/widget files above.
app.use('/uploads', express.static(path.resolve(uploadsDir)));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Heart & Soul Rescue backend running on port ${PORT}`);
});
