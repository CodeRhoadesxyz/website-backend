# Heart & Soul Parrot Rescue — Backend & Admin Portal

A self-contained backend for your site: an admin portal for adoption, relinquishment, and
volunteer applications, plus an event system with RSVP that replaces the Google Calendar embed.

## What's included

- **API** (Express + SQLite) — stores applications, events, RSVPs, adoptable birds,
  announcements, and the community blog.
- **Admin portal** at `/admin` — login-protected dashboard to review applications and manage events.
- **Embeddable widgets** at `/widgets` — drop-in `<script>` snippets for your existing site.

No database server to manage — it's a single SQLite file. No build step for the frontend — it's
plain HTML/CSS/JS, so there's nothing to compile or deploy beyond copying files.

## 1. Run it locally first

```bash
cd rescue-backend
npm install
cp .env.example .env
# edit .env: set JWT_SECRET to a long random string, and ALLOWED_ORIGINS to your site's URL
npm run seed-admin -- youradminname a-strong-password
npm start
```

Visit `http://localhost:4000/admin/login.html` and sign in.

## 2. Hosting recommendation: Railway

Railway is a good fit here because it's inexpensive for a small nonprofit's traffic, deploys
straight from a GitHub repo, and — importantly — supports a **persistent volume**, which SQLite
needs (without one, your database would reset every time you redeploy).

Steps:

1. Push this folder to a GitHub repo.
2. Create a new Railway project → "Deploy from GitHub repo".
3. In the service's Settings → Volumes, attach a volume mounted at `/data`.
4. In Variables, set:
   - `JWT_SECRET` — a long random string
   - `ALLOWED_ORIGINS` — `https://heartandsoulparrotrescue.com,https://www.heartandsoulparrotrescue.com`
   - `DATABASE_PATH` — `/data/rescue.db`
5. Deploy. Railway gives you a public URL like `https://your-app.up.railway.app`.
6. Open a one-off shell (Railway's "Run a command" feature) and run:
   `node scripts/create-admin.js youradminname a-strong-password`
   (this CLI script is only needed for this very first account — once you can log in, add any
   further admins directly from the panel's **Admin access** tab instead)
7. Visit `https://your-app.up.railway.app/admin/login.html` to confirm it works.

Render is a solid alternative with the same approach (persistent disk add-on + web service).
Avoid pure static/shared hosting for this piece — it needs to run a Node process continuously.

## 3. Embedding into heartandsoulparrotrescue.com

You don't need to move your existing site. Just add these snippets to the relevant pages, using
your live backend URL (e.g. `https://your-app.up.railway.app`) in place of `API_BASE_URL` below.

> **Want `/admin` to work as `heartandsoulparrotrescue.com/admin` instead of the Railway URL?**
> Two options, pick one:
> - `cloudflare-worker/README.md` — routes just `/admin` and `/api` through Cloudflare's edge to
>   Railway. Requires a one-time nameserver change, but your existing cPanel hosting keeps serving
>   everything else untouched.
> - `cpanel-proxy/README.md` — a small PHP script on your existing cPanel hosting does the same
>   thing without any DNS changes at all.

**Site-wide admin badge** (add this one line to every page — your header/footer include if your
site has one, otherwise paste it near the closing `</body>` tag of each page):
```html
<script src="API_BASE_URL/widgets/admin-badge.js"></script>
```
When you're browsing the public site while signed into the admin panel, a small floating badge
appears in the bottom-right corner reading "Admin: yourname →" — click it to jump straight into
`/admin`. Regular visitors never see anything; the badge only renders after successfully checking
your admin session. **Requires the Cloudflare Worker or PHP proxy setup above** — it works by
checking your admin login cookie, which only gets sent on requests to your own domain, not
directly to Railway.

**Adoption application page:**
```html
<div id="rescue-adoption-form"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/form-builder.js"></script>
<script src="API_BASE_URL/widgets/adoption-form.js" data-api-base="API_BASE_URL"></script>
```

**Relinquishment page:**
```html
<div id="rescue-relinquishment-form"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/form-builder.js"></script>
<script src="API_BASE_URL/widgets/relinquishment-form.js" data-api-base="API_BASE_URL"></script>
```

**Volunteer page:**
```html
<div id="rescue-volunteer-form"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/form-builder.js"></script>
<script src="API_BASE_URL/widgets/volunteer-form.js" data-api-base="API_BASE_URL"></script>
```

> **Important:** all three forms above need `form-builder.js` loaded, not just `shared.js` — it's
> the piece that actually builds and validates the form fields. If a form isn't appearing on the
> page at all, this is the most common cause: check your page's HTML and confirm all five lines
> are present, in this order, for each form.

**Events page** (this replaces the Google Calendar embed):
```html
<div id="rescue-events-list"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/events-list.js" data-api-base="API_BASE_URL"></script>
```

**Homepage — news announcement banner** (place this just above your "Our Mission" section):
```html
<div id="rescue-announcement-banner"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/announcement-banner.js" data-api-base="API_BASE_URL"></script>
```
This renders as a single slim, pill-shaped line of text (a small dot, a bold title, your message, and an optional link) — not a boxed callout — so it sits quietly above your mission statement instead of competing with it. If you haven't published an announcement in the admin portal, the `<div>` collapses to nothing and takes up no space at all, so it's safe to leave on the page permanently.

**Adoptable birds page** (this replaces the Petfinder embed):
```html
<div id="rescue-birds-grid"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/form-builder.js"></script>
<script src="API_BASE_URL/widgets/adoption-form.js" data-api-base="API_BASE_URL"></script>
<script src="API_BASE_URL/widgets/birds-grid.js" data-api-base="API_BASE_URL"></script>
```
Renders a responsive photo grid (available birds first, then pending — adopted birds are excluded
from this listing automatically, since you likely have a separate "adopted" success-stories page).

By default, each card's "Apply to Adopt →" button **pops up the adoption application form right on
this page** — no separate application page needed — with that bird's name already filled in. The
submission goes straight into your admin panel's Adoption applications tab, same as any other
adoption submission. This is why `form-builder.js` and `adoption-form.js` need to be included here
too, even though this page doesn't show a standalone adoption form of its own — the birds grid
borrows that code to build the popup.

If you'd rather link to a separate, dedicated adoption application page instead of popping up a
modal, set `data-apply-url="adoption.html"` (or wherever that page lives) on the `birds-grid.js`
script tag — that switches every card's button back to a plain link (still carrying the bird's name
through as a `?bird=` parameter for pre-filling), and you can drop the `form-builder.js`/
`adoption-form.js` lines above from this specific page if you go that route.

Remove the old Petfinder embed code from `adoptable.html` and put this in its place.

**Community blog page** (any page — this is a full page in itself: account signup/login, post
creation, a post list, and comments, all in one widget):
```html
<div id="rescue-blog"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/blog.js" data-api-base="https://heartandsoulparrotrescue.com"></script>
```
Notice `data-api-base` here points at **your own domain**, not the Railway URL — this is different
from every other widget on purpose. The `<script src="...">` line can still load from Railway
directly (that part doesn't involve cookies), but the actual API calls this widget makes need to go
through your own domain's `/api/*` path, which your Cloudflare Worker (or PHP proxy, if you went
that route instead) already forwards to Railway. Skip this and point it straight at Railway like
the other widgets, and login will silently stop working on Safari/iPhone: the login cookie gets
set, but Safari's cross-site tracking prevention drops it almost immediately since it looks like a
third-party tracking cookie to Safari. Going through your own domain makes the whole thing look
like an ordinary same-site request, which sidesteps that restriction entirely.

Anyone can sign up with just a username/password and display name (no email verification) and
start posting and commenting immediately. Once signed in, "Edit profile" lets someone update their
display name and add a profile picture (a plain image URL, same pattern as the other photo fields
in this project — no file upload). Clicking a post updates the URL with a shareable `#post-123`-style
link. Users can delete their own posts/comments; you can moderate anything from the admin panel's
**Community** tab regardless of who posted it.

> **If you haven't set up the Cloudflare Worker or PHP proxy** from earlier and `/api/*` isn't
> routed through your own domain, the blog widget will still technically work in Chrome/Firefox
> using the Railway URL directly for `data-api-base` — but logins won't reliably stay signed in on
> Safari/iPhone, for the reason above. Setting up one of those two proxy options is worth doing
> specifically for this widget even if you skipped it before.

## 4. Using the admin portal day to day

- **Home tab** (the default landing view): at-a-glance counts for adoption applications,
  relinquishment applications, and total event RSVPs, with a "new" count for each application type.
  Click any card to jump straight to that section.
- **Applications tabs** (Adoption / Relinquishment / Volunteer): click any row to see the full
  submission, set a status (New → In review → Approved/Declined → Archived), and leave internal
  notes. Filter by status with the dropdown.
- **Events tab**: "+ Add event" to create one (it appears on your site's events widget
  immediately once published). "RSVPs" shows everyone who signed up, with guest counts. Set a
  capacity to auto-close RSVPs once full, or leave it blank for unlimited.
- **News announcements tab**: "+ Add announcement" to create one. The homepage banner always
  shows only the single newest *published* announcement that's still active. Announcements
  automatically go **Inactive** (hidden from visitors, tagged as such here) 5 days after creation —
  they're never deleted automatically, so you can review or manually delete them whenever you like.
  Add a link URL/text if you want the banner to point somewhere (an event, a blog post, a
  fundraiser, etc.), and optionally an image URL — it shows as a small round thumbnail in place of
  the plain dot, kept intentionally small so the banner stays a slim line rather than a boxy card.
- **Adoptable birds tab**: "+ Add bird" to list one — name, species, age, sex, a photo URL, a short
  description, and a status (Available / Pending / Adopted). The public grid always shows Available
  birds first, then Pending; Adopted birds are hidden from this listing automatically (set to Draft
  instead of deleting if you want to keep a record without showing it anywhere).
- **Community tab**: moderation for the public blog. The Posts table lets you "View" any post (full
  text + all its comments, each individually deletable) or delete the whole post outright. The
  Accounts table lists every signed-up user with their post/comment counts — set a **Role** badge
  (e.g. "Founder," "Vice President," "Website Developer," or anything else you type) that shows
  next to their name everywhere on the blog; leave it blank for no badge. "Suspend" immediately
  blocks that account from logging in, posting, or commenting (without deleting their existing
  content), and "Delete" removes the account and everything they ever posted or commented,
  permanently.
- **Admin access tab**: add or remove admin accounts directly from the panel — no server/Railway
  shell access needed anymore. Anyone added here has full access to everything in this admin panel.
  You can't remove your own account while signed in as it, and the panel won't let you remove the
  last remaining admin account (there always has to be at least one way in).

## 5. Customizing

- Widget colors live in `public/widgets/widgets.css` (CSS variables at the top) — easy to match
  your site's existing palette.
- Admin dashboard colors live in `public/admin/styles.css`.
- To add/remove fields on any application form, edit the `fields` array in the matching file in
  `public/widgets/` (e.g. `adoption-form.js`) — the form and validation update automatically.

## Security notes

- Change `JWT_SECRET` before going live — don't use the placeholder.
- Only add real site origins to `ALLOWED_ORIGINS`.
- Admin passwords are hashed (bcrypt) and sessions are stored in an httpOnly cookie — the token
  is never exposed to page JavaScript.
- Back up the SQLite file (or Railway volume) periodically — it's the only copy of your data.
