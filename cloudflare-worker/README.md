# Serving /admin from heartandsoulparrotrescue.com via Cloudflare

This gets `https://heartandsoulparrotrescue.com/admin` and `/api` working exactly
as typed, by routing just those two paths through Cloudflare's edge to your
Railway backend — everything else on your site (homepage, adopt page, etc.)
keeps working through your existing cPanel host, completely untouched.

This replaces the PHP proxy option (`cpanel-proxy/`) — use one or the other,
not both.

## What changes, and what doesn't

- Your domain's **nameservers** move to Cloudflare (a one-time change at
  wherever you bought the domain — GoDaddy, Namecheap, etc.).
- Cloudflare then sits in front of your site. For almost every request, it
  just passes traffic straight through to your current cPanel host — **your
  site keeps working exactly as it does now.**
- Only for `/admin/*` and `/api/*` does Cloudflare intercept the request and
  hand it to a small piece of code (a "Worker") that forwards it to your
  Railway backend instead.

## Setup

### 1. Create a free Cloudflare account and add your site
1. Go to cloudflare.com and sign up (free plan is enough).
2. Click "Add a site," enter `heartandsoulparrotrescue.com`.
3. Cloudflare scans your current DNS records automatically and shows you
   what it found (your A record pointing at your cPanel host, any MX/email
   records, etc.). **Review this list and make sure everything looks
   present** — especially any email-related records if your rescue's email
   runs through the same domain — before continuing.

### 2. Update your nameservers
1. Cloudflare gives you two nameservers (something like
   `aria.ns.cloudflare.com` and `bob.ns.cloudflare.com`).
2. Log into wherever you registered the domain and replace the existing
   nameservers with Cloudflare's two.
3. This can take anywhere from a few minutes to a few hours to propagate.
   Cloudflare will email you once it's detected the switch.

### 3. Set SSL/TLS mode
In the Cloudflare dashboard, go to **SSL/TLS** → set the mode to **Full**
(or **Full (strict)** if your cPanel host has a valid SSL certificate,
which it should if your site already loads over `https://`).

### 4. Create the Worker
1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** →
   **Create Worker**.
2. Give it a name, e.g. `rescue-admin-proxy`.
3. Delete the placeholder code and paste in the contents of `worker.js`
   from this folder.
4. Edit the `UPSTREAM` line near the top to your actual Railway URL.
5. Click **Deploy**.

### 5. Route the Worker to the right paths
1. Still in Workers & Pages, open your new Worker → **Settings** → **Triggers**
   → **Add Route**.
2. Add two routes:
   - `heartandsoulparrotrescue.com/admin*`
   - `heartandsoulparrotrescue.com/api*`
3. Save.

### 6. Test it
- Visit `https://heartandsoulparrotrescue.com/admin/login.html` — you
  should see the sign-in screen, and logging in should work normally.
- Visit `https://heartandsoulparrotrescue.com/api/health` — should return
  `{"ok":true}`.
- Visit your homepage and a couple of other existing pages to confirm
  nothing else broke.

## If something doesn't work

- **Whole site is down after the nameserver switch** — double-check step 1;
  if any DNS record was missed when Cloudflare imported them, add it
  manually under **DNS** in the dashboard.
- **`/admin` shows a Cloudflare error page instead of the dashboard** —
  confirm the Worker routes in step 5 exactly match your domain (no `www.`
  mismatch — add a second pair of routes for `www.heartandsoulparrotrescue.com/admin*`
  and `.../api*` too if people might visit with `www.`).
- **Logged in, but the dashboard immediately asks you to sign in again** —
  double-check `UPSTREAM` in `worker.js` doesn't have a typo or trailing
  slash.
- **Email stopped working** — this almost always means an MX record wasn't
  carried over in step 1. Add it back manually under **DNS** in the
  Cloudflare dashboard, matching whatever your email provider's setup
  instructions specify.

## What this does *not* change

- Your embedded forms/widgets on the public pages (adoption, volunteer,
  events, announcement banner) keep working exactly as already set up,
  calling the Railway URL directly.
- Your `ALLOWED_ORIGINS` setting on Railway doesn't need to change.
