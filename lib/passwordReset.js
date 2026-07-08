const crypto = require('crypto');
const db = require('../db');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// We only ever store a hash of the token, never the token itself — same
// principle as password_hash. The raw token only ever exists in the email
// link and briefly in memory here.
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// accountType is 'admin' or 'user', accountId is that account's row id.
// Returns the raw (unhashed) token — this is the only place it's readable —
// so the caller can put it in the reset link.
function createResetToken(accountType, accountId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Invalidate any earlier outstanding tokens for this account so only the
  // most recently requested link works.
  db.prepare(
    `DELETE FROM password_reset_tokens WHERE account_type = ? AND account_id = ?`
  ).run(accountType, accountId);

  db.prepare(
    `INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(accountType, accountId, tokenHash, expiresAt);

  return rawToken;
}

// Returns { accountType, accountId } if the token is valid and unused, or
// null otherwise. Does NOT mark it as used — call consumeResetToken for that,
// once the new password has actually been saved.
function verifyResetToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const row = db
    .prepare(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(tokenHash);

  if (!row) return null;
  return { accountType: row.account_type, accountId: row.account_id, tokenHash };
}

function consumeResetToken(tokenHash) {
  db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE token_hash = ?`).run(tokenHash);
}

module.exports = { createResetToken, verifyResetToken, consumeResetToken };
