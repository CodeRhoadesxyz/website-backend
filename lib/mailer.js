const nodemailer = require('nodemailer');

const isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  console.warn(
    'Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — application/RSVP notifications ' +
      'and password reset emails will be skipped. See README.md for setup.'
  );
}

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured) {
    console.warn(`Email skipped (not configured): "${subject}" to ${to}`);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    console.log(`Email sent: "${subject}" to ${to} (message id: ${info.messageId})`);
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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = { sendMail, notifyAdminNewApplication, notifyAdminNewRsvp, sendPasswordResetEmail, isConfigured };
