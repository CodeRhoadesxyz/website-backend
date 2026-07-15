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
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'needs_info', 'approved', 'declined', 'archived')),
    admin_notes TEXT DEFAULT '',
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS application_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'applicant')),
    sender_id INTEGER,
    sender_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    email TEXT DEFAULT '',
    reset_token TEXT,
    reset_token_expires TEXT,
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

  CREATE TABLE IF NOT EXISTS fosters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bird_id INTEGER NOT NULL REFERENCES birds(id) ON DELETE CASCADE,
    foster_name TEXT NOT NULL,
    foster_contact TEXT DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    quantity_needed TEXT DEFAULT '',
    is_fulfilled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_name TEXT NOT NULL,
    bird_name TEXT DEFAULT '',
    story TEXT NOT NULL,
    photo_url TEXT DEFAULT '',
    is_approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bird_id INTEGER NOT NULL REFERENCES birds(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
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
  CREATE INDEX IF NOT EXISTS idx_fosters_bird ON fosters(bird_id);
  CREATE INDEX IF NOT EXISTS idx_testimonials_approved ON testimonials(is_approved);
  CREATE INDEX IF NOT EXISTS idx_waitlist_bird ON waitlist(bird_id);
  CREATE TABLE IF NOT EXISTS store_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    sale_price REAL,
    is_on_sale INTEGER NOT NULL DEFAULT 0,
    is_clearance INTEGER NOT NULL DEFAULT 0,
    is_sold_out INTEGER NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
    buy_url TEXT DEFAULT '',
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(is_published, sort_order);
  CREATE TABLE IF NOT EXISTS undo_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('edit', 'flush')),
    row_id INTEGER,
    snapshot TEXT NOT NULL,
    is_undone INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_store_published ON store_items(is_published);
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    admin_username TEXT NOT NULL,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete')),
    row_id INTEGER,
    snapshot TEXT NOT NULL,
    is_undone INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_undo_log_undone ON undo_log(is_undone, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_log_admin ON activity_log(admin_id, is_undone, created_at);
  CREATE INDEX IF NOT EXISTS idx_application_messages_app ON application_messages(application_id);
`);

function addColumnIfMissing(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

// A database created before this update has an `applications` table whose
// CHECK constraint doesn't allow 'needs_info' as a status, and has no
// user_id column at all. SQLite can't ALTER a CHECK constraint or add a
// column with a REFERENCES clause after the fact, so this rebuilds the
// table in place (same technique SQLite's own docs recommend) — but only
// runs at all if the old schema is actually detected, so this is a no-op on
// a fresh install (which already gets the right schema from CREATE TABLE
// above) and a no-op on any database that's already been migrated once.
function migrateApplicationsTableIfNeeded() {
  const table = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applications'`).get();
  if (!table || table.sql.includes('needs_info')) return;

  db.exec(`
    ALTER TABLE applications RENAME TO applications_old;

    CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('adoption', 'relinquishment', 'volunteer')),
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'needs_info', 'approved', 'declined', 'archived')),
      admin_notes TEXT DEFAULT '',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO applications (id, type, data, status, admin_notes, user_id, created_at, updated_at)
      SELECT id, type, data, status, admin_notes, NULL, created_at, updated_at FROM applications_old;

    DROP TABLE applications_old;

    CREATE INDEX IF NOT EXISTS idx_applications_type ON applications(type);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  `);
}

migrateApplicationsTableIfNeeded();

addColumnIfMissing('announcements', "image_url TEXT DEFAULT ''");
addColumnIfMissing('users', "avatar_url TEXT DEFAULT ''");
addColumnIfMissing('users', "role TEXT DEFAULT ''");
addColumnIfMissing('users', "email TEXT DEFAULT ''");
addColumnIfMissing('users', "reset_token TEXT");
addColumnIfMissing('users', "reset_token_expires TEXT");
addColumnIfMissing('birds', "sponsor_url TEXT DEFAULT ''");
addColumnIfMissing('admins', "email TEXT DEFAULT ''");
addColumnIfMissing('admins', "reset_token TEXT");
addColumnIfMissing('admins', "reset_token_expires TEXT");

try {
  db.exec(`UPDATE users SET username = LOWER(username) WHERE username != LOWER(username)`);
} catch (err) {
  console.error('Username lowercase migration skipped:', err.message);
}

module.exports = db;
