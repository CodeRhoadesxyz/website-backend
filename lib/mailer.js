// Uses Brevo's HTTPS API instead of raw SMTP. This matters specifically on
// Railway: SMTP ports (25, 465, 587) are firewalled off entirely on the
// Free/Hobby plan to prevent abuse — only a Pro plan or higher allows
// outbound SMTP. An HTTPS API call isn't SMTP traffic at all, so it isn't
// affected by that block and works on every Railway plan.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const isConfigured = Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);

if (!isConfigured) {
  console.warn(
    'Email is not configured (BREVO_API_KEY/EMAIL_FROM missing) — application/RSVP notifications ' +
      'and password reset emails will be skipped. See README.md for setup.'
  );
}

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured) {
    console.warn(`Email skipped (not configured): "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || html.replace(/<[^>]+>/g, ''),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Brevo API responded ${res.status}: ${errBody}`);
    }

    const data = await res.json().catch(() => ({}));
    console.log(`Email sent: "${subject}" to ${to} (message id: ${data.messageId || 'n/a'})`);
  } catch (err) {
    // Never let an email failure break the actual request (an application
    // was still received/saved even if the notification email fails).
    console.error(`Failed to send email "${subject}" to ${to}:`, err.message);
  }
}

const TYPE_LABELS = { adoption: 'Adoption', relinquishment: 'Relinquishment', volunteer: 'Volunteer' };

async function notifyAdminNewApplication(type, data) {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) return;

  const rows = Object.entries(data)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0; color:#666;">${k}</td><td style="padding:4px 0;">${escapeHtml(String(v))}</td></tr>`)
    .join('');

  await sendMail({
    to: adminEmail,
    subject: `New ${TYPE_LABELS[type] || type} application — ${data.fullName || 'unknown'}`,
    html: `
      <h2 style="font-family:sans-serif;">New ${TYPE_LABELS[type] || type} application</h2>
      <table style="font-family:sans-serif; font-size:14px;">${rows}</table>
      <p style="font-family:sans-serif; color:#888; margin-top:16px;">Review it in the admin portal.</p>
    `,
  });
}

async function notifyAdminNewRsvp(event, rsvp) {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) return;

  await sendMail({
    to: adminEmail,
    subject: `New RSVP for ${event.title}`,
    html: `
      <h2 style="font-family:sans-serif;">New RSVP — ${escapeHtml(event.title)}</h2>
      <p style="font-family:sans-serif; font-size:14px;">
        <strong>${escapeHtml(rsvp.name)}</strong> (${escapeHtml(rsvp.email)})${rsvp.phone ? ' · ' + escapeHtml(rsvp.phone) : ''}<br>
        Guests: ${rsvp.guests}${rsvp.notes ? `<br>Notes: ${escapeHtml(rsvp.notes)}` : ''}
      </p>
    `,
  });
}

async function sendPasswordResetEmail(user, resetUrl) {
  await sendMail({
    to: user.email,
    subject: 'Reset your password — Heart & Soul Parrot Rescue',
    html: `
      <p style="font-family:sans-serif; font-size:15px;">Hi ${escapeHtml(user.display_name)},</p>
      <p style="font-family:sans-serif; font-size:15px;">
        Someone requested a password reset for your account. If this was you, click below to set a new password
        (this link expires in 1 hour):
      </p>
      <p style="margin:20px 0;">
        <a href="${resetUrl}" style="background:#4f7358; color:#fff; padding:10px 20px; border-radius:999px; text-decoration:none; font-family:sans-serif; font-weight:600;">Reset password</a>
      </p>
      <p style="font-family:sans-serif; font-size:13px; color:#888;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
    `,
  });
}

async function sendAdminPasswordResetEmail(admin, resetUrl) {
  await sendMail({
    to: admin.email,
    subject: 'Reset your admin password — Heart & Soul Parrot Rescue',
    html: `
      <p style="font-family:sans-serif; font-size:15px;">Hi ${escapeHtml(admin.username)},</p>
      <p style="font-family:sans-serif; font-size:15px;">
        Someone requested a password reset for your admin portal account. If this was you, click below to
        set a new password (this link expires in 1 hour):
      </p>
      <p style="margin:20px 0;">
        <a href="${resetUrl}" style="background:#4f7358; color:#fff; padding:10px 20px; border-radius:999px; text-decoration:none; font-family:sans-serif; font-weight:600;">Reset password</a>
      </p>
      <p style="font-family:sans-serif; font-size:13px; color:#888;">
        If you didn't request this, you can safely ignore this email — your password won't change. If you're
        concerned about unauthorized access, let another admin know.
      </p>
    `,
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = { sendMail, notifyAdminNewApplication, notifyAdminNewRsvp, sendPasswordResetEmail, sendAdminPasswordResetEmail, isConfigured };
