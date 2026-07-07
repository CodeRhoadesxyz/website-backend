# Heart & Soul Parrot Rescue — Backend & Admin Portal

A self-contained backend for your site: an admin portal for adoption, relinquishment, and
volunteer applications, plus an event system with RSVP that replaces the Google Calendar embed.

## What's included

- **API** (Express + SQLite) — stores applications, events, and RSVPs.
- **Admin portal** at `/admin` — login-protected dashboard to review applications and manage events.
- **Embeddable widgets** at `/widgets` — drop-in `<script>` snippets for your existing site: three
  application forms and an events list with RSVP, styled to be easy to re-skin.

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
7. Visit `https://your-app.up.railway.app/admin/login.html` to confirm it works.

Render is a solid alternative with the same approach (persistent disk add-on + web service).
Avoid pure static/shared hosting for this piece — it needs to run a Node process continuously.

## 3. Embedding into heartandsoulparrotrescue.com

You don't need to move your existing site. Just add these snippets to the relevant pages, using
your live backend URL (e.g. `https://your-app.up.railway.app`) in place of `API_BASE_URL` below.

**Adoption application page:**
```html
<div id="rescue-adoption-form"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/form-builder.js"></script>
<script src="API_BASE_URL/widgets/adoption-form.js" data-api-base="API_BASE_URL"></script>
```

**Relinquishment page** — same pattern with `relinquishment-form.js` and
`<div id="rescue-relinquishment-form"></div>`.

**Volunteer page** — same pattern with `volunteer-form.js` and
`<div id="rescue-volunteer-form"></div>`.

**Events page** (this replaces the Google Calendar embed):
```html
<div id="rescue-events-list"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/events-list.js" data-api-base="API_BASE_URL"></script>
```

Remove the old Google Calendar iframe/embed code from that page and put this in its place.
Each form posts straight to your new backend and shows a thank-you message on success — no page
reload needed.

## 4. Using the admin portal day to day

- **Applications tabs** (Adoption / Relinquishment / Volunteer): click any row to see the full
  submission, set a status (New → In review → Approved/Declined → Archived), and leave internal
  notes. Filter by status with the dropdown.
- **Events tab**: "+ Add event" to create one (it appears on your site's events widget
  immediately once published). "RSVPs" shows everyone who signed up, with guest counts. Set a
  capacity to auto-close RSVPs once full, or leave it blank for unlimited.

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
