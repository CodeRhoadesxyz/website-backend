const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || './data/rescue.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('adoption', 'relinquishment', 'volunteer')),
    data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'approved', 'declined', 'archived')),
    admin_notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    location TEXT DEFAULT '',
    start_time TEXT NOT NULL,
    end_time TEXT,
    image_url TEXT DEFAULT '',
    capacity INTEGER,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    guests INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT DEFAULT '',
    link_text TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS birds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    age TEXT DEFAULT '',
    sex TEXT DEFAULT '',
    description TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'adopted')),
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    role TEXT DEFAULT '',
    is_banned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Manually-logged donations (checks, cash, or off-site platforms like
  -- PayPal/Facebook Giving) — not a payment processor integration, just a
  -- record-keeping + reporting tool for whatever came in.
  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    donor_email TEXT DEFAULT '',
    amount REAL NOT NULL,
    donation_date TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'other' CHECK (method IN ('cash', 'check', 'online', 'in_kind', 'other')),
    campaign TEXT DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Roster of approved, active volunteers/fosters. Distinct from the
  -- applications table (the initial "volunteer" form submission) — a
  -- volunteer row is created once someone's approved and sticks around for
  -- as long as they're involved, tracking their fostering history and hours.
  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    skills TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    joined_date TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Which volunteer is fostering which bird, and when. end_date is NULL
  -- while the foster is ongoing.
  CREATE TABLE IF NOT EXISTS foster_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    bird_id INTEGER NOT NULL REFERENCES birds(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL DEFAULT (date('now')),
    end_date TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Logged volunteer hours, one row per entry so they can be reported on by
  -- date range as well as summed per-volunteer.
  CREATE TABLE IF NOT EXISTS volunteer_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL,
    hours REAL NOT NULL,
    activity TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_applications_type ON applications(type);
  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
  CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
  CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_published, created_at);
  CREATE INDEX IF NOT EXISTS idx_birds_status ON birds(status, is_published);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
  CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date);
  CREATE INDEX IF NOT EXISTS idx_donations_method ON donations(method);
  CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(status);
  CREATE INDEX IF NOT EXISTS idx_foster_volunteer ON foster_assignments(volunteer_id);
  CREATE INDEX IF NOT EXISTS idx_foster_bird ON foster_assignments(bird_id);
  CREATE INDEX IF NOT EXISTS idx_foster_active ON foster_assignments(end_date);
  CREATE INDEX IF NOT EXISTS idx_hours_volunteer ON volunteer_hours(volunteer_id, log_date);

  -- One-time tokens for the "forgot password" flow. Shared by both admin
  -- accounts and blog users (account_type distinguishes them), so a token
  -- minted for one can never be used to reset the other.
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL CHECK (account_type IN ('admin', 'user')),
    account_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reset_tokens_lookup ON password_reset_tokens(token_hash, expires_at);

  -- Every admin-initiated action (creates/updates/deletes across the portal,
  -- plus sign-in/sign-out and password resets). Written automatically by the
  -- audit middleware in server.js, so new routes get logged without any
  -- extra code — see lib/auditLog.js for how entries are built.
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    admin_username TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    details TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);

  -- Single-row table (id is always 1) holding the site's maintenance-mode
  -- state. starts_at/ends_at are optional — NULL means "no scheduled
  -- start/end", i.e. it takes effect immediately and stays on until an admin
  -- turns it off.
  CREATE TABLE IF NOT EXISTS maintenance_mode (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT 'We''re currently performing scheduled maintenance. Please check back soon.',
    starts_at TEXT,
    ends_at TEXT,
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO maintenance_mode (id, enabled) VALUES (1, 0);
`);

function addColumnIfMissing(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

addColumnIfMissing('announcements', "image_url TEXT DEFAULT ''");
addColumnIfMissing('users', "avatar_url TEXT DEFAULT ''");
addColumnIfMissing('users', "role TEXT DEFAULT ''");
addColumnIfMissing('users', "email TEXT DEFAULT ''");
addColumnIfMissing('admins', "email TEXT DEFAULT ''");
// Lets an admin "claim" an application so two people don't both reach out to
// the same applicant. Stored as a plain admin id (not an inline FK — SQLite's
// ALTER TABLE ADD COLUMN restricts REFERENCES clauses on existing tables) and
// resolved to a username via a join in the route.
addColumnIfMissing('applications', 'claimed_by INTEGER');
addColumnIfMissing('applications', 'claimed_at TEXT');

try {
  db.exec(`UPDATE users SET username = LOWER(username) WHERE username != LOWER(username)`);
} catch (err) {
  console.error('Username lowercase migration skipped:', err.message);
}

module.exports = db;
