# Heart & Soul Parrot Rescue — Backend & Admin Portal

A self-contained backend for your site: an admin portal for adoption, relinquishment, and
volunteer applications, plus an event system with RSVP that replaces the Google Calendar embed.

## What's included

- **API** (Express + SQLite) — stores applications, events, RSVPs, adoptable birds,
  announcements, and the community blog.
- **Admin portal** at `/admin` — login-protected dashboard to review applications and manage
  events, with search, CSV export, and direct photo uploads.
- **Embeddable widgets** at `/widgets` — drop-in `<script>` snippets for your existing site.
- **Email notifications** for new applications and RSVPs, plus password reset for blog accounts
  (both optional — see "Setting up email" below).

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
needs (without one, your database would reset every time you redeploy). Uploaded bird/event/
announcement photos also need to live on that same volume, for the same reason.

Steps:

1. Push this folder to a GitHub repo.
2. Create a new Railway project → "Deploy from GitHub repo".
3. In the service's Settings → Volumes, attach a volume mounted at `/data`.
4. In Variables, set:
   - `JWT_SECRET` — a long random string
   - `ALLOWED_ORIGINS` — `https://heartandsoulparrotrescue.com,https://www.heartandsoulparrotrescue.com`
   - `DATABASE_PATH` — `/data/rescue.db`
   - `UPLOADS_PATH` — `/data/uploads`
   - `BREVO_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`, `BLOG_PAGE_URL` — see "Setting up email"
     below (optional, but skipping these means no notification emails or password reset emails
     will send)
5. Deploy. Railway gives you a public URL like `https://your-app.up.railway.app`.
6. Open a one-off shell (Railway's "Run a command" feature) and run:
   `node scripts/create-admin.js youradminname a-strong-password`
   (this CLI script is only needed for this very first account — once you can log in, add any
   further admins directly from the panel's **Admin access** tab instead)
7. Visit `https://your-app.up.railway.app/admin/login.html` to confirm it works.

Render is a solid alternative with the same approach (persistent disk add-on + web service).
Avoid pure static/shared hosting for this piece — it needs to run a Node process continuously.

## 3. Setting up email

Three things depend on email working: **notification emails** (you get an email whenever someone
submits an application or RSVPs), **password reset** for blog accounts, and **password reset**
for admin accounts. All optional — if you skip this section, everything else still works, these
things just silently do nothing (the server logs a warning instead of crashing).

**This uses Brevo's HTTPS API, not traditional SMTP — and that's a deliberate choice, not just a
preference.** Railway firewalls off all outbound SMTP ports (25, 465, 587) on its Free and Hobby
plans specifically to prevent spam abuse — SMTP only works there if you're on their paid Pro plan.
An API call over plain HTTPS isn't SMTP traffic at all, so it completely sidesteps that block and
works on every Railway plan, including free. Brevo's free tier (300 emails/day, no credit card) is
plenty for this project either way.

1. Sign up at brevo.com (free plan, no card needed).
2. In Brevo, go to **Senders, Domains & Dedicated IPs** → **Domains** → **Add a domain** → enter
   `heartandsoulparrotrescue.com`. Brevo shows you a few DNS records to add (SPF and DKIM, usually
   TXT/CNAME records) — these prove you actually own the domain and dramatically improve
   deliverability (without them, more of your emails land in spam). This step is about
   deliverability, not the API connection itself, but it's still worth doing.
3. Add those exact records in Cloudflare → **DNS** → **Records** → **Add record**, matching what
   Brevo shows you type-for-type. Leave proxy status **DNS only** (grey cloud) for these — they're
   plain DNS lookups, not something that should route through Cloudflare's proxy.
4. Back in Brevo, click verify (or wait — DNS can take a few minutes to a few hours to propagate).
5. Go to **SMTP & API** → **API Keys** tab → **Generate a new API key** → copy it (shown only once).
   Despite the "SMTP & API" section name, this key is specifically for the HTTPS API, not SMTP —
   you won't need an SMTP username/password/host/port at all.
6. Set these environment variables on Railway (or in your local `.env`):
   ```
   BREVO_API_KEY=the-api-key-brevo-generated
   EMAIL_FROM=noreply@heartandsoulparrotrescue.com
   ADMIN_NOTIFY_EMAIL=heartandsoulparrots@gmail.com
   BLOG_PAGE_URL=https://heartandsoulparrotrescue.com/blog.html
   ADMIN_PORTAL_URL=https://heartandsoulparrotrescue.com/admin/reset-password.html
   ```
   `EMAIL_FROM` must be an address at the domain you just verified (any address works —
   `noreply@`, `hello@`, etc. — it doesn't need to be a real inbox). `ADMIN_NOTIFY_EMAIL` is just
   where notifications land, so your existing Gmail inbox is fine to keep using there.
   `ADMIN_PORTAL_URL` is where an admin's password reset link points — **each admin also needs an
   email address on file** (Admin Access tab → Edit, or `node scripts/create-admin.js user pass
   their@email.com`) before "Forgot password?" on the admin login page will do anything for them.
7. Redeploy. Submit a test application on your site and confirm the notification email arrives
   (check spam the first time, just in case).

No code changes are needed to switch to a different provider later — as long as it also offers an
HTTPS API (Resend, SendGrid, and Postmark all do), the same pattern in `lib/mailer.js` applies, you'd
just be changing which API URL and header it calls. **A traditional SMTP host/port/user/password
setup (Gmail included) will not work while hosted on Railway's Free/Hobby plan** — it'll fail with a
connection timeout, not because anything is misconfigured, but because the outbound connection
itself is blocked at the network level before it ever reaches the provider.

## 4. Embedding into heartandsoulparrotrescue.com

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

**Site-wide account nav** (add this to every page, same idea as the admin badge above):
```html
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script
  src="API_BASE_URL/widgets/user-nav.js"
  data-api-base="https://heartandsoulparrotrescue.com"
  data-community-url="/dashboard.html#community"
  data-dashboard-url="/dashboard.html"
></script>
```
A small floating badge in the top-right corner of every page. Signed-out visitors see **Log in**
/ **Sign up** buttons that open an inline form right there — no page navigation needed. Once
signed in, it shows their name instead; clicking it opens a menu with **My applications & chats**
and **Community** (both linked to `dashboard.html` — see "Dashboard page" below, which has a tab
for each), plus a **Log out** option. Both URLs default to `/dashboard.html` if you don't set
them — override with the actual path on your site if you name the file something else.

Automatically renders in dark mode when the visitor's device/browser is set to dark mode — no
configuration needed, same as the rest of the widget set.

Like the blog and my-applications widgets, `data-api-base` here needs to point at **your own
domain**, not the Railway URL directly (same reason: Safari's cross-site cookie restrictions),
since this reads the exact same `user_token` cookie those widgets use — a visitor only has to sign
in once and it carries across the nav badge, the blog, and their applications dashboard.

**Dashboard page** (one page — replaces what used to be two separate pages, `blog.html` and
`dashboard.html`; a starting-point file is in `main-site-pages/dashboard.html` in this project,
ready to upload to your site's document root):
```html
<div id="rescue-my-applications"></div>
<div id="rescue-blog"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/my-applications.js" data-api-base="https://heartandsoulparrotrescue.com"></script>
<script src="API_BASE_URL/widgets/blog.js" data-api-base="https://heartandsoulparrotrescue.com"></script>
```
The provided `dashboard.html` wraps both widgets in a simple tab switcher (My Applications & Chats
/ Community) so only one shows at a time — it's just show/hide, it doesn't change how either
widget works internally. **Delete your old `blog.html`** once this is live, and set up a redirect
from `/blog.html` to `/dashboard.html#community` so old links/bookmarks still land somewhere. Both
widgets still each show their own sign-in prompt if a visitor arrives signed out (on top of the
site-wide nav badge above) — that's a bit of duplication, since the two widgets don't share login
state live on the page, but everything stays functionally correct: signing in through either form
signs the visitor into both.


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

**Community** (this is now a tab on the combined `dashboard.html` page — see "Dashboard page"
above — rather than its own separate page):

> **If you already had blog accounts before this update:** email is now required for new
> signups, but existing accounts won't have one on file yet and can't use "Forgot password?" until
> they add one — point them to "Edit profile" to set it.

Notice `data-api-base` for `blog.js` points at **your own domain**, not the Railway URL — this is different
from every other widget on purpose. The `<script src="...">` line can still load from Railway
directly (that part doesn't involve cookies), but the actual API calls this widget makes need to go
through your own domain's `/api/*` path, which your Cloudflare Worker (or PHP proxy, if you went
that route instead) already forwards to Railway. Skip this and point it straight at Railway like
the other widgets, and login will silently stop working on Safari/iPhone: the login cookie gets
set, but Safari's cross-site tracking prevention drops it almost immediately since it looks like a
third-party tracking cookie to Safari. Going through your own domain makes the whole thing look
like an ordinary same-site request, which sidesteps that restriction entirely.

Anyone can sign up with a username/password/email and display name and start commenting
immediately — the email isn't verified on signup, it's only ever used to send a password reset
link if they forget their password (see "Setting up email" above; this needs `BREVO_API_KEY` and
`BLOG_PAGE_URL` configured — point `BLOG_PAGE_URL` at `.../dashboard.html#community` now — or the
"Forgot password?" link on the login form silently won't send anything). **Creating new posts is
restricted** to whoever you've assigned a Founder, Vice
President, or Website Developer role to in the Community tab — everyone else can read and comment
on any post, but the "+ New post" button only appears for those three roles (and the server
enforces this too, not just the button being hidden). Once signed in, "Edit profile" lets someone
update their display name, email, and profile picture. Clicking a post updates the URL with a
shareable `#post-123`-style link. Users can delete their own posts/comments; you can moderate
anything from the admin panel's **Community** tab regardless of who posted it.

> **If you haven't set up the Cloudflare Worker or PHP proxy** from earlier and `/api/*` isn't
> routed through your own domain, the blog widget will still technically work in Chrome/Firefox
> using the Railway URL directly for `data-api-base` — but logins won't reliably stay signed in on
> Safari/iPhone, for the reason above. Setting up one of those two proxy options is worth doing
> specifically for this widget even if you skipped it before.

**Supply wishlist** (anywhere — a donate page is the natural spot):
```html
<div id="rescue-wishlist"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/wishlist.js" data-api-base="API_BASE_URL"></script>
```
Shows whatever's currently marked "needed" in the admin panel's Wishlist tab. Collapses to a
friendly "all stocked up" message when nothing's on the list — never shows an empty gap.

**FAQ** (anywhere — adoptable birds or a dedicated FAQ page both make sense):
```html
<div id="rescue-faq"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/faq.js" data-api-base="API_BASE_URL"></script>
```
A simple click-to-expand accordion, ordered by the "sort order" you set per question in the admin
panel's FAQs tab.

**Testimonials / success stories** (anywhere — an "Adopted" or "Success Stories" page is the
natural fit):
```html
<div id="rescue-testimonials"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/testimonials.js" data-api-base="API_BASE_URL"></script>
```
Anyone can submit a story via the "Share your story →" button — it doesn't show publicly until you
approve it from the admin panel's Testimonials tab, so nothing goes live unmoderated.

**Store** (a dedicated shop/merch page, or a section of your donate page):
```html
<div id="rescue-store"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/store.js" data-api-base="API_BASE_URL"></script>
```
A photo grid with sale/clearance badges and strikethrough pricing when an item's on sale. **This
is a catalog, not a checkout** — clicking "Buy Now" sends the visitor to whatever `buy_url` you set
per item (a PayPal.me link, Stripe Payment Link, Etsy listing, etc.), the same pattern as bird
sponsorship. Building an actual in-house shopping cart/payment system is a much bigger and riskier
undertaking than this needs — this way you get a real storefront without taking on PCI compliance
or payment processing yourself.

**Our Impact** (homepage, or an About/donate page):
```html
<div id="rescue-impact"></div>
<link rel="stylesheet" href="API_BASE_URL/widgets/widgets.css">
<script src="API_BASE_URL/widgets/shared.js"></script>
<script src="API_BASE_URL/widgets/impact.js" data-api-base="API_BASE_URL"></script>
```
Four numbers pulled live from your actual data — birds adopted, total birds helped, adoption rate,
and events hosted. Updates automatically as your data changes; nothing to maintain by hand.

**My Applications** (this is now a tab on the combined `dashboard.html` page — see "Dashboard
page" above — rather than its own separate page). Like the blog widget, `data-api-base` for
`my-applications.js` points at **your own domain**, not the Railway URL
directly — same reason as the blog (Safari's cross-site cookie restrictions), since this uses the
exact same account system. Lets a signed-in visitor see the status of their own applications
(Received / Being reviewed / Action needed / Approved / Not approved / Archived) and message back
and forth with your team about a specific application, right on the page.

**Important limitation to know about:** an application only shows up here if the person was
**signed in at the moment they submitted it**. Someone who applies without an account, then signs
up afterward, won't see that older application here — there's no retroactive linking. Worth
mentioning this on your application pages themselves if you want people to actually use this
feature ("Sign in before applying if you'd like to track your status here").

## 5. Using the admin portal day to day

- **Home tab** (the default landing view): at-a-glance counts for adoption applications,
  relinquishment applications, total event RSVPs, and birds currently in your care, with a "new"
  count for each application type. An "Adoption performance" card shows your overall adoption rate
  and average days-to-adoption — handy figures for grant applications. Click any card to jump
  straight to that section.
- **Applications tabs** (Adoption / Relinquishment / Volunteer): click any row to see the full
  submission, set a status (New → In review → **Needs info from applicant** → Approved/Declined →
  Archived), and leave internal notes. Filter by status with the dropdown, or search by
  name/email/phone with the search box — it searches whatever's typed against every field on the
  submission. "Export CSV" downloads whatever's currently showing (respects the active status
  filter and search), handy for grant reporting or keeping your own records.

  Every application detail also has a **Conversation** panel — a real chat thread with whoever
  submitted it, if they were signed into an account at the time (see the My Applications widget
  above). Sending your first reply automatically bumps a "New" application to "In review," so
  nothing sits looking untouched once you've actually responded. If an application shows a note
  saying it isn't linked to an account, messages sent there are saved but the applicant can't see
  them — you'll need to reach out by email/phone directly for those.
- **Events tab**: "+ Add event" to create one (it appears on your site's events widget
  immediately once published). Upload a photo directly (or paste an image URL, whichever's easier)
  instead of needing to host it somewhere else first. "RSVPs" shows everyone who signed up, with
  guest counts and its own "Export CSV" button. Set a capacity to auto-close RSVPs once full, or
  leave it blank for unlimited.
- **News announcements tab**: "+ Add announcement" to create one. The homepage banner always
  shows only the single newest *published* announcement that's still active. Announcements
  automatically go **Inactive** (hidden from visitors, tagged as such here) 5 days after creation —
  they're never deleted automatically, so you can review or manually delete them whenever you like.
  Add a link URL/text if you want the banner to point somewhere (an event, a blog post, a
  fundraiser, etc.), and optionally a photo (upload or URL) — it shows as a small round thumbnail
  in place of the plain dot, kept intentionally small so the banner stays a slim line rather than a
  boxy card.
- **Adoptable birds tab**: "+ Add bird" to list one — name, species, age, sex, a photo (upload or
  URL), a short description, a status (Available / Pending / Adopted), and an optional **sponsor
  link** (your PayPal/Stripe/donation link — shows a "Sponsor [name] 💚" button on that bird's
  public card if set). The public grid always shows Available birds first, then Pending; Adopted
  birds are hidden from this listing automatically (set to Draft instead of deleting if you want
  to keep a record without showing it anywhere). Each row also has:
  - **Waitlist** — see everyone who's joined the waitlist for that bird (visitors can join once a
    bird's status is Pending, from the public grid).
  - **Print packet** — opens a print-ready one-page summary (photo, bio) in a new tab, ready for
    `Ctrl/Cmd+P` → save as PDF or print directly, to hand to an adopter.
  - **Caption** — generates a ready-to-post social media caption for that bird, with a
    copy-to-clipboard button. The announcements tab has the same "Caption" button.
- **Fosters tab**: track which birds are currently (or were previously) in foster care — foster's
  name and contact info, start date, and an end date once the placement wraps up. Leave the end
  date blank for an ongoing placement.
- **Wishlist tab**: manage the "what we need right now" list shown on your site via the wishlist
  widget. Mark an item fulfilled once you've got enough instead of deleting it — keeps a quick
  history of what's been donated over time.
- **Testimonials tab**: review adopter-submitted success stories before they go live. Nothing
  posted through the public testimonials widget shows up on your site until you hit "Approve &
  publish" here.
- **FAQs tab**: manage the questions shown by the FAQ widget. Sort order controls the order they
  appear in (lower numbers first) — set them all to 0 to just show in creation order.
- **Store tab**: "+ Add item" — name, description, a photo (upload or URL), a regular price, and a
  buy link (where "Buy Now" sends visitors — see the store widget note above for why this isn't a
  built-in checkout). To **start a sale**: check "On sale" and enter a sale price — the storefront
  automatically shows the regular price struck through next to the sale price. To **mark
  clearance**: check "Clearance" — shows a distinct badge and clearance items sort to the front of
  the storefront. Both can be on at once. Check "Sold out" to disable the buy button without
  deleting the listing. Uncheck "On sale" to end a sale at any time — the regular price takes over
  immediately.
- **Community tab**: moderation for the public blog. The Posts table lets you "View" any post (full
  text + all its comments, each individually deletable) or delete the whole post outright. The
  Accounts table lists every signed-up user with their email, post/comment counts — set a **Role**
  (exactly "Founder," "Vice President," or "Website Developer" — case doesn't matter, but the
  wording does) to both show a badge next to their name *and* let them create new posts; any other
  text (or leaving it blank) shows no badge and means they can still comment on posts but not start
  new ones. "Suspend" immediately blocks that account from logging in, posting, or commenting
  (without deleting their existing content), and "Delete" removes the account and everything they
  ever posted or commented, permanently.
- **Admin access tab**: visible only to the super admin (see `SUPER_ADMIN_USERNAME` below) — other
  admins don't see this tab at all, and the underlying API rejects the requests even if someone
  tried to call it directly. Add, edit, or remove admin accounts directly from the panel — no
  server/Railway shell access needed anymore. "Edit" lets you change an account's username and/or
  password (leave the password field blank to keep the current one) — useful for resetting your
  own or someone else's password if needed. You can't remove your own account while signed in as
  it, and the panel won't let you remove the last remaining admin account (there always has to be
  at least one way in). Note: if you change your own username, "Signed in as..." won't update
  until you sign out and back in — that's just a display quirk, your access itself isn't affected.

  **Permissions**: by default, a new admin can view and edit every tab. Click **Permissions** on
  any admin's row to restrict them instead — a checklist of every other tab (Adoption/
  Relinquishment/Volunteer applications, Birds, Fosters, Events, Announcements, Wishlist,
  Testimonials, FAQs, Store, Community) with a **View** and an **Edit** checkbox each. Unchecking
  View hides that tab from their sidebar entirely; View-without-Edit lets them look but not add,
  change, or delete anything there (they'll see a small "view only" note on that tab, and the
  server rejects any edit attempt regardless of what the browser shows, so this can't be bypassed
  by calling the API directly either). "Reset to full access" clears all restrictions for that
  admin in one click. This is Admin-access-tab territory too — only the super admin can view or
  change anyone's permissions, including their own.

  Every other admin (anyone not flagged **Super admin**, see below) has an **"Undo actions"**
  button — opens a checklist of that specific admin's recent creates/edits/deletes across the
  whole panel (applications, events, birds, announcements, everything), each with its own
  checkbox. Select as many as you want and undo them together in one go — useful if someone made a
  batch of mistakes, or you just want to review what a particular admin's been doing. Each
  selected action is undone independently, so if one fails (say, the row was already changed again
  some other way) the rest still go through. This tracks actions *made through the regular admin
  panel* specifically — it's separate from, and doesn't cover, the database tools panel below,
  which has its own independent undo log.

  If `SUPER_ADMIN_USERNAME` is set (see the next section), that account is labeled **Super admin**
  here and doesn't get an "Undo actions" button or a "Permissions" button of its own — that account
  always has full, unrestricted access to every tab (it's not something even the super admin can
  turn off on their own account), plus the more powerful `/superadmin` panel below.

  One limitation worth knowing: undoing a **deleted event** or **deleted user account** restores
  that row itself, but not anything that was cascade-deleted along with it (an event's RSVPs, a
  user's posts and comments) — those would need to be manually recreated if they mattered.

## 6. Database tools (Dalton only)

A separate, more powerful panel at `/superadmin` for one specific admin account — raw table
browsing and editing, flushing a table, a read-only query tool, a server monitor, backups, and a
manual restart. This is meaningfully more dangerous than the regular admin panel (direct database
edits have no undo), so it's worth understanding exactly what it does and doesn't do before turning
it on.

### Turning it on

Set `SUPER_ADMIN_USERNAME` (see `.env.example`) to the exact username of the one admin account
that should have access — e.g. `SUPER_ADMIN_USERNAME=dalton`. This doesn't create an account; it
restricts an existing one. That same setting is also what makes the **Admin access** tab and the
per-tab **Permissions** feature above Dalton-only — both are driven off this one environment
variable, not a separate flag, so there's exactly one place to configure who your super admin is.
Leave it blank to disable `/superadmin`, the Admin access tab, and permission management all at
once (regular admins keep full access to every other tab as before). Redeploy after setting it.


### Setting up api.heartandsoulparrotrescue.com

This works fine at your regular Railway URL already, but a dedicated subdomain is cleaner:

1. In Railway, open your backend service → **Settings** → **Networking** → **Custom Domain** →
   enter `api.heartandsoulparrotrescue.com`. Railway gives you a CNAME target to use.
2. In Cloudflare → **DNS**, add a **CNAME** record: Name = `api`, Target = whatever Railway gave
   you, Proxy status = **DNS only** (grey cloud, not orange) — this is a dedicated API subdomain,
   so it doesn't need to go through your Worker or Cloudflare's proxy at all, and going DNS-only
   here avoids any complications with Railway issuing its own SSL certificate for the subdomain.
3. Wait a few minutes for DNS to propagate, then visit
   `https://api.heartandsoulparrotrescue.com/superadmin/login.html`.

Your existing `.up.railway.app` URL, the Cloudflare Worker for `/admin` and `/api` on your main
domain, and everything else keep working exactly as before — this is purely an additional URL.

### What each tab actually does

- **Tables overview**: every table with its row count. "Browse" opens a paginated raw view of that
  table's actual rows — this bypasses all the normal validation the rest of the app does (an
  application's status here isn't restricted to "New/In review/etc," for example), so mistakes here
  won't be caught the way they would be through the regular admin tabs. Edit only what you mean to.
- **Flush**: deletes every row in one table. Requires typing the exact table name to confirm. Every
  flush is automatically logged and reversible from the **Undo log** tab for 72 hours afterward —
  see below for exactly how that works and what its limits are. The `admins` table is hard-blocked
  from flushing here specifically because wiping it out could lock every admin out with no way
  back in; manage admin accounts from the regular **Admin Access** tab instead, which has its own
  safeguards.
- **Undo log**: every flush and row edit made through this panel, most recent first, each with an
  "Undo this" button. Entries disappear from this list after 72 hours (they're not deleted, just
  hidden — ask if you ever need one restored past that window). Important limits to understand:
  - Undoing a **flush** re-inserts every row that was deleted, exactly as they were.
  - Undoing an **edit** restores only the specific field(s) that edit changed — if something else
    modified that same row afterward (through the regular admin panel, a visitor submitting a form,
    another edit here, etc.), undo doesn't touch those other changes, only reverts its own.
  - If a row was edited and then later deleted (by a flush, or outside this panel entirely),
    undoing that earlier edit will correctly refuse rather than silently recreating a row from
    incomplete data.
  - **This is not a substitute for backups.** It covers mistakes made *through this panel*
    specifically — it does nothing for changes made anywhere else in the app, and it isn't a
    general point-in-time restore. Download a real backup before anything you're not fully sure
    about.
- **Read-only query**: runs a single `SELECT` statement and shows the results. Anything else
  (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `PRAGMA`, etc.) is rejected before it ever reaches the
  database — this is intentionally not a full SQL console, since a typo in a raw write query could
  do real damage with no confirmation step in the way.
- **Server monitor**: uptime, memory use, database file size, Node version. "Restart now" cleanly
  exits the server process, relying on Railway's restart-on-crash behavior to bring it back up
  within a few seconds. **Before relying on this**, confirm in Railway → Settings → Deploy that the
  restart policy isn't set to "Never" — if it is, this button would take the site down with nothing
  to bring it back except a manual redeploy.
- **Backup**: downloads a complete, consistent snapshot of the database file, safe to run anytime
  without interrupting the live site. Still worth doing before any flush or bulk edit despite the
  undo log above — undo covers this panel's own mistakes, a backup covers everything else.

Passwords and password-reset tokens are never shown or editable through this panel, even to the
super admin — they're masked in the row browser and rejected if you try to edit them directly,
since those already have their own dedicated, safer flows elsewhere in the app.

## 7. Customizing

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
- Only set `SUPER_ADMIN_USERNAME` if you actually intend to use `/superadmin` — it's real,
  unrestricted database access (minus passwords/tokens specifically) for whichever account it
  names, with no additional confirmation beyond that account's normal login.
