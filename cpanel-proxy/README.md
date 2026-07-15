# Serving /admin from heartandsoulparrotrescue.com (cPanel proxy)

This lets `https://heartandsoulparrotrescue.com/admin` work exactly as typed,
while the actual backend keeps running on Railway. No DNS/nameserver changes
needed — just two files on your existing cPanel hosting.

## How it works

Your `.htaccess` quietly routes any request under `/admin/*` or `/api/*` to
`rescue-proxy.php`, which forwards it to your Railway backend over HTTPS and
relays the response back — cookies, status codes, and all. The browser only
ever talks to your own domain.

## Setup

1. **Edit `rescue-proxy.php`**: change the line
   ```php
   define('UPSTREAM_BASE', 'https://your-app.up.railway.app');
   ```
   to your actual Railway URL (no trailing slash).

2. **Upload `rescue-proxy.php`** to your site's document root via cPanel File
   Manager or FTP — the same folder that contains your homepage's
   `index.html` (typically `public_html/`).

3. **Update your `.htaccess`** in that same folder: open the existing one in
   File Manager and paste in the block from `htaccess-snippet.txt`. Don't
   delete anything that's already there — just add this block, ideally near
   the top of the file, before any other broad rewrite rules your site may
   already have.

4. **Test it**: visit
   `https://heartandsoulparrotrescue.com/admin/login.html` — you should see
   the sign-in screen, and logging in should work normally. Check
   `https://heartandsoulparrotrescue.com/api/health` too — it should return
   `{"ok":true}`.

## If something doesn't work

- **500 error on any `/admin` or `/api` page** — your host may have the PHP
  cURL extension disabled. Ask your host's support to confirm `php-curl` is
  enabled for your account (it's on by default almost everywhere).
- **Blank page or the wrong site loads at `/admin`** — another rule earlier
  in your `.htaccess` may be catching the request first. Move the proxy
  block higher up in the file.
- **Logged in, but the dashboard immediately asks you to sign in again** —
  double check `UPSTREAM_BASE` doesn't have a typo or trailing slash; a
  failed upstream connection can look like an auth failure.

## What this does *not* change

- Your embedded forms/widgets on the public pages (adoption, volunteer,
  events, announcement banner) keep working exactly as already set up,
  calling the Railway URL directly — you don't need to touch those.
- Your `ALLOWED_ORIGINS` setting on Railway doesn't need to change either;
  requests coming through this proxy arrive as ordinary server-to-server
  calls, not browser cross-origin requests.
