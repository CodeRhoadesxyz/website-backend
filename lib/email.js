// Uses Brevo's (formerly Sendinblue) transactional email REST API directly
// via Node's built-in fetch — no extra npm dependency needed. Brevo's free
// plan covers 300 emails/day (~9,000/month) permanently, no credit card.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || '[email protected]';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Heart & Soul Parrot Rescue';

// Every send is wrapped so a failed email (bad API key, Brevo outage, etc.)
// never crashes the request that triggered it — it just gets logged.
async function send({ to, subject, html, text }) {
  if (!BREVO_API_KEY) {
    console.warn(`[email] BREVO_API_KEY not set — skipping email to ${to}: "${subject}"`);
    return { skipped: true };
  }

  const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: recipients,
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[email] Brevo returned ${res.status}:`, errBody);
      return { error: errBody || res.statusText };
    }

    return await res.json();
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return { error: err.message };
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendPasswordResetEmail({ to, resetUrl, accountLabel }) {
  const subject = 'Reset your password — Heart & Soul Parrot Rescue';
  const text = `We received a request to reset the password for your ${accountLabel} account.\n\nReset it here (link expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      <h2 style="margin-bottom: 0.25rem;">Reset your password</h2>
      <p>We received a request to reset the password for your <strong>${escapeHtml(accountLabel)}</strong> account.</p>
      <p style="margin: 1.5rem 0;">
        <a href="${resetUrl}" style="background:#2f5233; color:#fff; padding:0.75rem 1.25rem; border-radius:6px; text-decoration:none; display:inline-block;">
          Reset password
        </a>
      </p>
      <p style="font-size: 0.85rem; color: #666;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p style="font-size: 0.75rem; color: #999; word-break: break-all;">Or paste this URL into your browser: ${resetUrl}</p>
    </div>
  `;
  return send({ to, subject, html, text });
}

async function sendNewApplicationNotification({ to, type, applicantName, applicationId, adminUrl }) {
  const typeLabels = { adoption: 'Adoption', relinquishment: 'Relinquishment', volunteer: 'Volunteer' };
  const label = typeLabels[type] || type;
  const subject = `New ${label} application — ${applicantName}`;
  const text = `A new ${label.toLowerCase()} application was just submitted by ${applicantName}.\n\nView it in the admin portal:\n${adminUrl}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      <h2 style="margin-bottom: 0.25rem;">New ${escapeHtml(label)} application</h2>
      <p><strong>${escapeHtml(applicantName)}</strong> just submitted a new ${escapeHtml(label.toLowerCase())} application (#${applicationId}).</p>
      <p style="margin: 1.5rem 0;">
        <a href="${adminUrl}" style="background:#2f5233; color:#fff; padding:0.75rem 1.25rem; border-radius:6px; text-decoration:none; display:inline-block;">
          Review in admin portal
        </a>
      </p>
    </div>
  `;
  return send({ to, subject, html, text });
}

module.exports = { sendPasswordResetEmail, sendNewApplicationNotification };
