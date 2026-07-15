// Usage: node scripts/create-admin.js <username> <password>
// Creates a new admin, or updates the password if the username already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-admin.js <username> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  console.log(`Updated password for admin "${username}".`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  console.log(`Created admin "${username}".`);
}
