// Usage: node scripts/create-admin.js <username> <password> [email]
// Creates a new admin, or updates the password (and email, if given) if the
// username already exists. An email is required for that admin to be able
// to use "forgot password" later.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [, , username, password, email] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-admin.js <username> <password> [email]');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM admins WHERE username = ? COLLATE NOCASE').get(username);

if (existing) {
  if (email) {
    db.prepare('UPDATE admins SET password_hash = ?, email = ? WHERE id = ?').run(passwordHash, email.trim().toLowerCase(), existing.id);
  } else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id);
  }
  console.log(`Updated admin "${username}".`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)').run(username, passwordHash, (email || '').trim().toLowerCase());
  console.log(`Created admin "${username}".`);
}
