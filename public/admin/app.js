const API_BASE = window.location.origin;

const STATUS_LABELS = {
  new: 'New',
  in_review: 'In review',
  approved: 'Approved',
  declined: 'Declined',
  archived: 'Archived',
};

const TAB_TITLES = {
  home: 'Home',
  adoption: 'Adoption applications',
  relinquishment: 'Relinquishment applications',
  volunteer: 'Volunteer applications',
  events: 'Events',
  announcements: 'News announcements',
  birds: 'Adoptable birds',
  donations: 'Donations',
  volunteers: 'Volunteers & fosters',
  community: 'Community',
  admins: 'Admin access',
};

const DONATION_METHOD_LABELS = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online',
  in_kind: 'In-kind',
  other: 'Other',
};

const VOLUNTEER_STATUS_LABELS = { active: 'Active', inactive: 'Inactive' };

// Friendly labels for the free-form JSON fields stored in applications.data,
// across all three form types (adoption/relinquishment/volunteer share some
// field names, like fullName/email/phone). Anything submitted that isn't in
// this map still displays fine — humanizeFieldName() turns camelCase into
// Title Case as a fallback, so new form fields never show up unlabeled.
const APPLICATION_FIELD_LABELS = {
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Home Address',
  whichBird: 'Bird of Interest',
  homeType: 'Home Type',
  birdExperience: 'Prior Bird Experience',
  aboutHousehold: 'Household',
  birdSpecies: 'Species',
  birdAge: 'Age',
  birdHealth: 'Health',
  reasonForRelinquishment: 'Reason',
  interests: 'Interests',
  availability: 'Availability',
  experience: 'Experience',
};

function humanizeFieldName(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function applicationFieldLabel(key) {
  return APPLICATION_FIELD_LABELS[key] || humanizeFieldName(key);
}

let currentTab = 'adoption';

// ---------- helpers ----------

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = './login.html';
    throw new Error('Not authenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(message) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function fmtDate(input) {
  if (!input) return '—';
  // SQLite's created_at/updated_at look like "2026-07-19 11:00:00" and are true UTC —
  // those need a Z so the browser converts to local time. Event start_time/end_time
  // come from a <input type="datetime-local"> as "2026-07-19T11:00" and are ALREADY
  // local wall-clock time, so they must be parsed as-is (no Z), or the displayed time
  // shifts by your timezone offset.
  const isSqliteUtcTimestamp = input.includes(' ') && !input.includes('T');
  const d = new Date(isSqliteUtcTimestamp ? input.replace(' ', 'T') + 'Z' : input);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- boot ----------

let currentAdminId = null;

async function boot() {
  try {
    const me = await api('/api/auth/me');
    currentAdminId = me.id;
    document.getElementById('signed-in-as').textContent = `Signed in as ${me.username}`;
  } catch (e) {
    return; // api() already redirected
  }

  document.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = './login.html';
  });

  switchTab('home');
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('view-title').textContent = TAB_TITLES[tab];

  const homeView = document.getElementById('home-view');
  const appView = document.getElementById('app-view');
  const eventsView = document.getElementById('events-view');
  const announcementsView = document.getElementById('announcements-view');
  const birdsView = document.getElementById('birds-view');
  const donationsView = document.getElementById('donations-view');
  const volunteersView = document.getElementById('volunteers-view');
  const communityView = document.getElementById('community-view');
  const adminsView = document.getElementById('admins-view');

  homeView.style.display = 'none';
  appView.style.display = 'none';
  eventsView.style.display = 'none';
  announcementsView.style.display = 'none';
  birdsView.style.display = 'none';
  donationsView.style.display = 'none';
  volunteersView.style.display = 'none';
  communityView.style.display = 'none';
  adminsView.style.display = 'none';

  if (tab === 'home') {
    homeView.style.display = 'block';
    loadHome();
  } else if (tab === 'events') {
    eventsView.style.display = 'block';
    loadEvents();
  } else if (tab === 'announcements') {
    announcementsView.style.display = 'block';
    loadAnnouncements();
  } else if (tab === 'birds') {
    birdsView.style.display = 'block';
    loadBirds();
  } else if (tab === 'donations') {
    donationsView.style.display = 'block';
    loadDonations();
  } else if (tab === 'volunteers') {
    volunteersView.style.display = 'block';
    loadVolunteers();
  } else if (tab === 'community') {
    communityView.style.display = 'block';
    loadCommunity();
  } else if (tab === 'admins') {
    adminsView.style.display = 'block';
    loadAdmins();
  } else {
    appView.style.display = 'block';
    loadApplications(tab);
  }
}

// ---------- applications ----------

async function loadApplications(type, statusFilter) {
  const appView = document.getElementById('app-view');
  appView.innerHTML = `
    <div class="filters">
      <select id="status-filter">
        <option value="">All statuses</option>
        ${Object.entries(STATUS_LABELS).map(([val, label]) =>
          `<option value="${val}" ${statusFilter === val ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
    </div>
    <div id="app-table-wrap">Loading…</div>
  `;

  document.getElementById('status-filter').addEventListener('change', (e) => {
    loadApplications(type, e.target.value || undefined);
  });

  let params = `type=${type}`;
  if (statusFilter) params += `&status=${statusFilter}`;

  try {
    const apps = await api(`/api/applications?${params}`);
    renderApplicationsTable(apps);
  } catch (e) {
    document.getElementById('app-table-wrap').innerHTML = `<div class="empty-state">Could not load applications.</div>`;
  }
}

function renderApplicationsTable(apps) {
  const wrap = document.getElementById('app-table-wrap');
  if (apps.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No applications here yet.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Submitted</th><th>Name</th><th>Email</th><th>Status</th><th>Claimed</th></tr>
      </thead>
      <tbody>
        ${apps.map((app) => `
          <tr class="clickable" data-id="${app.id}">
            <td class="mono">${fmtDate(app.created_at)}</td>
            <td>${escapeHtml(app.data.fullName || '—')}</td>
            <td>${escapeHtml(app.data.email || '—')}</td>
            <td><span class="pill pill-${app.status}">${STATUS_LABELS[app.status]}</span></td>
            <td>
              ${app.claimed_by
                ? `<span class="pill ${app.claimed_by === currentAdminId ? 'pill-approved' : 'pill-in_review'}">${app.claimed_by === currentAdminId ? 'You' : escapeHtml(app.claimed_by_username || 'Claimed')}</span>`
                : `<button class="btn-secondary" data-quick-claim="${app.id}" style="font-size:0.78rem; padding:0.3rem 0.65rem;">Claim</button>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openApplicationModal(row.dataset.id));
  });

  wrap.querySelectorAll('[data-quick-claim]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api(`/api/applications/${btn.dataset.quickClaim}/claim`, { method: 'POST' });
        toast('Application claimed.');
        loadApplications(currentTab);
      } catch (err) {
        alert(err.message);
        loadApplications(currentTab);
      }
    })
  );
}

async function openApplicationModal(id) {
  const app = await api(`/api/applications/${id}`);
  const fields = Object.entries(app.data)
    .map(([key, value]) => `<div style="margin-bottom:0.5rem;"><strong>${escapeHtml(applicationFieldLabel(key))}:</strong> ${escapeHtml(value)}</div>`)
    .join('');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Application #${app.id}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <p class="mono" style="color:var(--muted); font-size:0.8rem;">Submitted ${fmtDate(app.created_at)}</p>

        <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1rem;">
          <span style="font-size:0.9rem;">
            ${app.claimed_by
              ? `<strong>${app.claimed_by === currentAdminId ? 'Claimed by you' : `Claimed by ${escapeHtml(app.claimed_by_username || 'another admin')}`}</strong>${app.claimed_at ? ` <span class="mono" style="color:var(--muted); font-size:0.78rem;">since ${fmtDate(app.claimed_at)}</span>` : ''}`
              : `<span style="color:var(--muted);">Not claimed — anyone could reach out to this applicant.</span>`}
          </span>
          ${app.claimed_by
            ? `<button class="btn-secondary" id="unclaim-btn" style="font-size:0.82rem;">Unclaim</button>`
            : `<button class="btn-primary" id="claim-btn" style="font-size:0.82rem;">Claim</button>`}
        </div>

        <div class="card">${fields}</div>

        <label for="status-select">Status</label>
        <select id="status-select">
          ${Object.entries(STATUS_LABELS).map(([val, label]) =>
            `<option value="${val}" ${app.status === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>

        <label for="notes-field">Internal notes</label>
        <textarea id="notes-field" rows="3">${escapeHtml(app.admin_notes || '')}</textarea>

        ${app.type === 'volunteer' ? `
          <button class="btn-secondary" id="add-as-volunteer-btn" style="width:100%; margin-top:0.75rem;">+ Add to volunteer roster</button>
        ` : ''}

        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          <button class="btn-danger" id="delete-app">Delete</button>
          <button class="btn-primary" id="save-app">Save changes</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  if (app.claimed_by) {
    document.getElementById('unclaim-btn').addEventListener('click', async () => {
      try {
        await api(`/api/applications/${id}/unclaim`, { method: 'POST' });
        toast('Claim released.');
        openApplicationModal(id);
      } catch (err) {
        alert(`Could not unclaim: ${err.message}`);
      }
    });
  } else {
    document.getElementById('claim-btn').addEventListener('click', async () => {
      try {
        await api(`/api/applications/${id}/claim`, { method: 'POST' });
        toast('Application claimed.');
        openApplicationModal(id);
      } catch (err) {
        alert(err.message);
        openApplicationModal(id);
      }
    });
  }

  if (app.type === 'volunteer') {
    document.getElementById('add-as-volunteer-btn').addEventListener('click', async () => {
      try {
        await api('/api/volunteers', {
          method: 'POST',
          body: JSON.stringify({
            full_name: app.data.fullName || '',
            email: app.data.email || '',
            phone: app.data.phone || '',
            skills: app.data.interests || '',
            application_id: app.id,
          }),
        });
        toast('Added to volunteer roster.');
        closeModal();
        switchTab('volunteers');
      } catch (err) {
        alert(`Could not add volunteer: ${err.message}`);
      }
    });
  }

  document.getElementById('save-app').addEventListener('click', async () => {
    const status = document.getElementById('status-select').value;
    const admin_notes = document.getElementById('notes-field').value;
    try {
      await api(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, admin_notes }) });
      toast('Application updated.');
      closeModal();
      loadApplications(currentTab);
    } catch (err) {
      alert(`Could not save changes: ${err.message}`);
    }
  });

  document.getElementById('delete-app').addEventListener('click', async () => {
    if (!confirm('Delete this application permanently?')) return;
    try {
      await api(`/api/applications/${id}`, { method: 'DELETE' });
      toast('Application deleted.');
      closeModal();
      loadApplications(currentTab);
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  });
}

// ---------- events ----------

async function loadEvents() {
  const view = document.getElementById('events-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;">
      <button class="btn-primary" id="new-event-btn">+ Add event</button>
    </div>
    <div id="events-table-wrap">Loading…</div>
  `;
  document.getElementById('new-event-btn').addEventListener('click', () => openEventModal());

  try {
    const events = await api('/api/events?all=1');
    renderEventsTable(events);
  } catch (e) {
    document.getElementById('events-table-wrap').innerHTML = `<div class="empty-state">Could not load events.</div>`;
  }
}

function renderEventsTable(events) {
  const wrap = document.getElementById('events-table-wrap');
  if (events.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No events yet. Add your first one above.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>When</th><th>Title</th><th>RSVPs</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${events.map((ev) => `
          <tr>
            <td class="mono">${fmtDate(ev.start_time)}</td>
            <td>${escapeHtml(ev.title)}</td>
            <td>${ev.rsvp_count ?? 0}${ev.capacity ? ` / ${ev.capacity}` : ''}</td>
            <td><span class="pill ${ev.is_published ? 'pill-approved' : 'pill-archived'}">${ev.is_published ? 'Published' : 'Draft'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-rsvp="${ev.id}" style="margin-right:0.4rem;">RSVPs</button>
              <button class="btn-secondary" data-edit="${ev.id}">Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openEventModal(events.find((e) => e.id == btn.dataset.edit)))
  );
  wrap.querySelectorAll('[data-rsvp]').forEach((btn) =>
    btn.addEventListener('click', () => openRsvpModal(btn.dataset.rsvp))
  );
}

function openEventModal(event) {
  const isEdit = Boolean(event);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit event' : 'New event'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="field-grid">
          <div><label>Title</label><input id="ev-title" value="${escapeHtml(event?.title || '')}" /></div>
          <div><label>Description</label><textarea id="ev-desc" rows="3">${escapeHtml(event?.description || '')}</textarea></div>
          <div class="half"><label>Starts</label><input id="ev-start" type="datetime-local" value="${event ? fmtDateInput(event.start_time) : ''}" /></div>
          <div class="half"><label>Ends (optional)</label><input id="ev-end" type="datetime-local" value="${event?.end_time ? fmtDateInput(event.end_time) : ''}" /></div>
          <div><label>Location</label><input id="ev-location" value="${escapeHtml(event?.location || '')}" /></div>
          <div class="half"><label>Capacity (optional)</label><input id="ev-capacity" type="number" min="0" value="${event?.capacity ?? ''}" /></div>
          <div class="half"><label>Status</label>
            <select id="ev-published">
              <option value="1" ${event?.is_published !== 0 ? 'selected' : ''}>Published</option>
              <option value="0" ${event?.is_published === 0 ? 'selected' : ''}>Draft</option>
            </select>
          </div>
          <div><label>Image URL (optional)</label><input id="ev-image" value="${escapeHtml(event?.image_url || '')}" /></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-event">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-event">${isEdit ? 'Save changes' : 'Create event'}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-event').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      description: document.getElementById('ev-desc').value.trim(),
      start_time: document.getElementById('ev-start').value,
      end_time: document.getElementById('ev-end').value || null,
      location: document.getElementById('ev-location').value.trim(),
      capacity: document.getElementById('ev-capacity').value ? Number(document.getElementById('ev-capacity').value) : null,
      is_published: document.getElementById('ev-published').value === '1',
      image_url: document.getElementById('ev-image').value.trim(),
    };

    if (!payload.title || !payload.start_time) {
      alert('Title and start time are required.');
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Event updated.');
      } else {
        await api('/api/events', { method: 'POST', body: JSON.stringify(payload) });
        toast('Event created.');
      }
      closeModal();
      loadEvents();
    } catch (err) {
      alert(`Could not save changes: ${err.message}`);
    }
  });

  if (isEdit) {
    document.getElementById('delete-event').addEventListener('click', async () => {
      if (!confirm('Delete this event and all its RSVPs?')) return;
      try {
        await api(`/api/events/${event.id}`, { method: 'DELETE' });
        toast('Event deleted.');
        closeModal();
        loadEvents();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

async function openRsvpModal(eventId) {
  const rsvps = await api(`/api/events/${eventId}/rsvps`);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>RSVPs</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        ${rsvps.length === 0
          ? `<div class="empty-state">No RSVPs yet.</div>`
          : `<table>
              <thead><tr><th>Name</th><th>Email</th><th>Guests</th><th>Submitted</th></tr></thead>
              <tbody>
                ${rsvps.map((r) => `
                  <tr>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${escapeHtml(r.email)}</td>
                    <td>${r.guests}</td>
                    <td class="mono">${fmtDate(r.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

// ---------- announcements ----------

async function loadAnnouncements() {
  const view = document.getElementById('announcements-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;">
      <button class="btn-primary" id="new-announcement-btn">+ Add announcement</button>
    </div>
    <div id="announcements-table-wrap">Loading…</div>
  `;
  document.getElementById('new-announcement-btn').addEventListener('click', () => openAnnouncementModal());

  try {
    const items = await api('/api/announcements');
    renderAnnouncementsTable(items);
  } catch (e) {
    document.getElementById('announcements-table-wrap').innerHTML = `<div class="empty-state">Could not load announcements.</div>`;
  }
}

function renderAnnouncementsTable(items) {
  const wrap = document.getElementById('announcements-table-wrap');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No announcements yet. The homepage banner stays hidden until you publish one.</div>`;
    return;
  }

  const liveIndex = items.findIndex((a) => a.is_published && a.is_active);

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Created</th><th>Title</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.map((a, i) => {
          const statusLabel = !a.is_published ? 'Draft' : !a.is_active ? 'Inactive' : 'Published';
          const statusClass = !a.is_published ? 'pill-archived' : !a.is_active ? 'pill-declined' : 'pill-approved';
          return `
            <tr>
              <td class="mono">${fmtDate(a.created_at)}</td>
              <td>${escapeHtml(a.title)}${i === liveIndex ? ' <span class="pill pill-approved">Live on site</span>' : ''}</td>
              <td><span class="pill ${statusClass}">${statusLabel}</span></td>
              <td style="white-space:nowrap;"><button class="btn-secondary" data-edit="${a.id}">Edit</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    <p style="color:var(--muted); font-size:0.82rem; margin-top:0.75rem;">
      The homepage banner always shows only the newest <em>published</em> announcement that's still active.
      Announcements automatically go <strong>Inactive</strong> (hidden from visitors) 5 days after they're
      created — they aren't deleted, so you can still see them here and delete them yourself whenever you like.
    </p>
  `;

  wrap.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openAnnouncementModal(items.find((a) => a.id == btn.dataset.edit)))
  );
}

function openAnnouncementModal(announcement) {
  const isEdit = Boolean(announcement);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit announcement' : 'New announcement'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <label>Title</label>
        <input id="an-title" value="${escapeHtml(announcement?.title || '')}" placeholder="e.g. We're at capacity — foster homes needed" />
        <label>Message</label>
        <textarea id="an-message" rows="3" placeholder="Keep it short — this shows as a slim banner on the homepage.">${escapeHtml(announcement?.message || '')}</textarea>
        <label>Image URL (optional)</label>
        <input id="an-image" value="${escapeHtml(announcement?.image_url || '')}" placeholder="https://..." />
        <div class="field-grid">
          <div class="half"><label>Link URL (optional)</label><input id="an-link-url" value="${escapeHtml(announcement?.link_url || '')}" placeholder="https://..." /></div>
          <div class="half"><label>Link text (optional)</label><input id="an-link-text" value="${escapeHtml(announcement?.link_text || '')}" placeholder="e.g. Learn more" /></div>
          <div><label>Status</label>
            <select id="an-published">
              <option value="1" ${announcement?.is_published !== 0 ? 'selected' : ''}>Published</option>
              <option value="0" ${announcement?.is_published === 0 ? 'selected' : ''}>Draft</option>
            </select>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-announcement">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-announcement">${isEdit ? 'Save changes' : 'Create'}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-announcement').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('an-title').value.trim(),
      message: document.getElementById('an-message').value.trim(),
      image_url: document.getElementById('an-image').value.trim(),
      link_url: document.getElementById('an-link-url').value.trim(),
      link_text: document.getElementById('an-link-text').value.trim(),
      is_published: document.getElementById('an-published').value === '1',
    };

    if (!payload.title || !payload.message) {
      alert('Title and message are required.');
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/announcements/${announcement.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Announcement updated.');
      } else {
        await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
        toast('Announcement created.');
      }
      closeModal();
      loadAnnouncements();
    } catch (err) {
      alert(`Could not save changes: ${err.message}`);
    }
  });

  if (isEdit) {
    document.getElementById('delete-announcement').addEventListener('click', async () => {
      if (!confirm('Delete this announcement permanently?')) return;
      try {
        await api(`/api/announcements/${announcement.id}`, { method: 'DELETE' });
        toast('Announcement deleted.');
        closeModal();
        loadAnnouncements();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

// ---------- adoptable birds ----------

const BIRD_STATUS_LABELS = { available: 'Available', pending: 'Pending', adopted: 'Adopted' };

async function loadBirds() {
  const view = document.getElementById('birds-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;">
      <button class="btn-primary" id="new-bird-btn">+ Add bird</button>
    </div>
    <div id="birds-table-wrap">Loading…</div>
  `;
  document.getElementById('new-bird-btn').addEventListener('click', () => openBirdModal());

  try {
    const birds = await api('/api/birds?all=1');
    renderBirdsTable(birds);
  } catch (e) {
    document.getElementById('birds-table-wrap').innerHTML = `<div class="empty-state">Could not load birds.</div>`;
  }
}

function renderBirdsTable(birds) {
  const wrap = document.getElementById('birds-table-wrap');
  if (birds.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No birds listed yet. Add your first one above.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th></th><th>Name</th><th>Species</th><th>Status</th><th>Visible</th><th></th></tr></thead>
      <tbody>
        ${birds.map((b) => `
          <tr>
            <td>${b.photo_url
              ? `<img src="${escapeHtml(b.photo_url)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;" />`
              : `<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.06);"></div>`}</td>
            <td class="mono">${escapeHtml(b.name)}</td>
            <td>${escapeHtml(b.species)}</td>
            <td><span class="pill ${b.status === 'available' ? 'pill-approved' : b.status === 'pending' ? 'pill-new' : 'pill-archived'}">${BIRD_STATUS_LABELS[b.status]}</span></td>
            <td><span class="pill ${b.is_published ? 'pill-approved' : 'pill-archived'}">${b.is_published ? 'Published' : 'Draft'}</span></td>
            <td><button class="btn-secondary" data-edit="${b.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openBirdModal(birds.find((b) => b.id == btn.dataset.edit)))
  );
}

function openBirdModal(bird) {
  const isEdit = Boolean(bird);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit bird' : 'New bird'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="field-grid">
          <div class="half"><label>Name</label><input id="b-name" value="${escapeHtml(bird?.name || '')}" /></div>
          <div class="half"><label>Species</label><input id="b-species" value="${escapeHtml(bird?.species || '')}" /></div>
          <div class="half"><label>Age (optional)</label><input id="b-age" value="${escapeHtml(bird?.age || '')}" placeholder="e.g. 2 years" /></div>
          <div class="half"><label>Sex (optional)</label><input id="b-sex" value="${escapeHtml(bird?.sex || '')}" placeholder="e.g. Male" /></div>
          <div><label>Description</label><textarea id="b-desc" rows="4">${escapeHtml(bird?.description || '')}</textarea></div>
          <div><label>Photo URL (optional)</label><input id="b-photo" value="${escapeHtml(bird?.photo_url || '')}" placeholder="https://..." /></div>
          <div class="half"><label>Status</label>
            <select id="b-status">
              <option value="available" ${(!bird || bird.status === 'available') ? 'selected' : ''}>Available</option>
              <option value="pending" ${bird?.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="adopted" ${bird?.status === 'adopted' ? 'selected' : ''}>Adopted</option>
            </select>
          </div>
          <div class="half"><label>Visibility</label>
            <select id="b-published">
              <option value="1" ${bird?.is_published !== 0 ? 'selected' : ''}>Published</option>
              <option value="0" ${bird?.is_published === 0 ? 'selected' : ''}>Draft</option>
            </select>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-bird">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-bird">${isEdit ? 'Save changes' : 'Add bird'}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-bird').addEventListener('click', async () => {
    const payload = {
      name: document.getElementById('b-name').value.trim(),
      species: document.getElementById('b-species').value.trim(),
      age: document.getElementById('b-age').value.trim(),
      sex: document.getElementById('b-sex').value.trim(),
      description: document.getElementById('b-desc').value.trim(),
      photo_url: document.getElementById('b-photo').value.trim(),
      status: document.getElementById('b-status').value,
      is_published: document.getElementById('b-published').value === '1',
    };

    if (!payload.name || !payload.species) {
      alert('Name and species are required.');
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/birds/${bird.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Bird updated.');
      } else {
        await api('/api/birds', { method: 'POST', body: JSON.stringify(payload) });
        toast('Bird added.');
      }
      closeModal();
      loadBirds();
    } catch (err) {
      alert(`Could not save changes: ${err.message}`);
    }
  });

  if (isEdit) {
    document.getElementById('delete-bird').addEventListener('click', async () => {
      if (!confirm(`Remove ${bird.name} from the site permanently?`)) return;
      try {
        await api(`/api/birds/${bird.id}`, { method: 'DELETE' });
        toast('Bird deleted.');
        closeModal();
        loadBirds();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

// ---------- community moderation ----------

async function loadCommunity() {
  const view = document.getElementById('community-view');
  view.innerHTML = `
    <h3 style="margin-bottom:0.75rem;">Posts</h3>
    <div id="community-posts-wrap">Loading…</div>
    <h3 style="margin:2rem 0 0.75rem;">Accounts</h3>
    <div id="community-users-wrap">Loading…</div>
  `;

  try {
    const posts = await api('/api/posts');
    renderCommunityPosts(posts);
  } catch (e) {
    document.getElementById('community-posts-wrap').innerHTML = `<div class="empty-state">Could not load posts.</div>`;
  }

  try {
    const users = await api('/api/users');
    renderCommunityUsers(users);
  } catch (e) {
    document.getElementById('community-users-wrap').innerHTML = `<div class="empty-state">Could not load accounts.</div>`;
  }
}

function renderCommunityPosts(posts) {
  const wrap = document.getElementById('community-posts-wrap');
  if (posts.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No posts yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Posted</th><th>Title</th><th>Author</th><th>Comments</th><th></th></tr></thead>
      <tbody>
        ${posts.map((p) => `
          <tr>
            <td class="mono">${fmtDate(p.created_at)}</td>
            <td>${escapeHtml(p.title)}</td>
            <td>${escapeHtml(p.author_name)}</td>
            <td>${p.comment_count}</td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-view-post="${p.id}" style="margin-right:0.4rem;">View</button>
              <button class="btn-danger" data-delete-post="${p.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-view-post]').forEach((btn) =>
    btn.addEventListener('click', () => openPostModeration(btn.dataset.viewPost))
  );
  wrap.querySelectorAll('[data-delete-post]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this post and all its comments permanently?')) return;
      try {
        await api(`/api/posts/${btn.dataset.deletePost}`, { method: 'DELETE' });
        toast('Post deleted.');
        loadCommunity();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

async function openPostModeration(id) {
  const post = await api(`/api/posts/${id}`);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(post.title)}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <p class="mono" style="color:var(--muted); font-size:0.8rem;">By ${escapeHtml(post.author_name)} · ${fmtDate(post.created_at)}</p>
        <div class="card" style="white-space:pre-wrap;">${escapeHtml(post.body)}</div>

        <h4 style="margin-bottom:0.5rem;">Comments (${post.comments.length})</h4>
        ${post.comments.length === 0 ? `<p style="color:var(--muted); font-size:0.9rem;">No comments.</p>` : post.comments.map((c) => `
          <div class="card" style="padding:0.8rem 1rem; margin-bottom:0.6rem;">
            <p class="mono" style="color:var(--muted); font-size:0.78rem; margin-bottom:0.3rem;">${escapeHtml(c.author_name)} · ${fmtDate(c.created_at)}</p>
            <p style="margin-bottom:0.5rem;">${escapeHtml(c.body)}</p>
            <button class="btn-danger" data-delete-comment="${c.id}" style="font-size:0.8rem; padding:0.35rem 0.8rem;">Delete comment</button>
          </div>
        `).join('')}

        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          <button class="btn-danger" id="delete-post-modal">Delete entire post</button>
          <button class="btn-secondary" id="modal-close-2">Close</button>
        </div>
      </div>
    </div>
  `;

  const close = () => closeModal();
  document.getElementById('modal-close').addEventListener('click', close);
  document.getElementById('modal-close-2').addEventListener('click', close);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') close();
  });

  document.getElementById('delete-post-modal').addEventListener('click', async () => {
    if (!confirm('Delete this post and all its comments permanently?')) return;
    try {
      await api(`/api/posts/${id}`, { method: 'DELETE' });
      toast('Post deleted.');
      close();
      loadCommunity();
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  });

  document.querySelectorAll('[data-delete-comment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this comment permanently?')) return;
      try {
        await api(`/api/comments/${btn.dataset.deleteComment}`, { method: 'DELETE' });
        toast('Comment deleted.');
        openPostModeration(id);
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  });
}

function renderCommunityUsers(users) {
  const wrap = document.getElementById('community-users-wrap');
  if (users.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No accounts yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <datalist id="role-suggestions">
      <option value="Founder">
      <option value="Vice President">
      <option value="Website Developer">
    </datalist>
    <table>
      <thead><tr><th>Joined</th><th>Name</th><th>Username</th><th>Role</th><th>Posts</th><th>Comments</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td class="mono">${fmtDate(u.created_at)}</td>
            <td>${escapeHtml(u.display_name)}</td>
            <td class="mono">${escapeHtml(u.username)}</td>
            <td>
              <div style="display:flex; gap:0.3rem;">
                <input list="role-suggestions" data-role-input="${u.id}" value="${escapeHtml(u.role || '')}" placeholder="e.g. Founder" style="min-width:130px;" />
                <button class="btn-secondary" data-save-role="${u.id}" style="padding:0.4rem 0.7rem; font-size:0.82rem;">Set</button>
              </div>
            </td>
            <td>${u.post_count}</td>
            <td>${u.comment_count}</td>
            <td><span class="pill ${u.is_banned ? 'pill-declined' : 'pill-approved'}">${u.is_banned ? 'Suspended' : 'Active'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-toggle-ban="${u.id}" data-banned="${u.is_banned ? 'true' : 'false'}" style="margin-right:0.4rem;">${u.is_banned ? 'Unsuspend' : 'Suspend'}</button>
              <button class="btn-danger" data-delete-user="${u.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-save-role]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.saveRole;
      const input = wrap.querySelector(`[data-role-input="${id}"]`);
      try {
        await api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role: input.value.trim() }) });
        toast('Role updated.');
      } catch (err) {
        alert(`Could not update role: ${err.message}`);
      }
    })
  );

  wrap.querySelectorAll('[data-toggle-ban]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const nowBanned = btn.dataset.banned !== 'true';
      try {
        await api(`/api/users/${btn.dataset.toggleBan}`, { method: 'PATCH', body: JSON.stringify({ is_banned: nowBanned }) });
        toast(nowBanned ? 'Account suspended.' : 'Account unsuspended.');
        loadCommunity();
      } catch (err) {
        alert(`Could not update account: ${err.message}`);
      }
    })
  );

  wrap.querySelectorAll('[data-delete-user]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this account and all their posts/comments permanently?')) return;
      try {
        await api(`/api/users/${btn.dataset.deleteUser}`, { method: 'DELETE' });
        toast('Account deleted.');
        loadCommunity();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

// ---------- home dashboard ----------

async function loadHome() {
  const view = document.getElementById('home-view');
  view.innerHTML = `<div id="home-stats-wrap">Loading…</div>`;

  try {
    const stats = await api('/api/stats');
    renderHomeStats(stats);
  } catch (e) {
    document.getElementById('home-stats-wrap').innerHTML = `<div class="empty-state">Could not load stats.</div>`;
  }
}

function renderHomeStats(stats) {
  const wrap = document.getElementById('home-stats-wrap');

  const cards = [
    { key: 'adoption', label: 'Adoption applications', total: stats.adoption.total, sub: `${stats.adoption.new} new` },
    { key: 'relinquishment', label: 'Relinquishment applications', total: stats.relinquishment.total, sub: `${stats.relinquishment.new} new` },
    { key: 'events', label: 'Event RSVPs', total: stats.rsvps.total, sub: 'across all events' },
    { key: 'donations', label: 'Donations this month', total: `$${stats.donations.this_month.toFixed(2)}`, sub: `$${stats.donations.all_time.toFixed(2)} all-time` },
    { key: 'volunteers', label: 'Active volunteers', total: stats.volunteers.active, sub: `${stats.volunteers.active_fosters} active fosters` },
  ];

  wrap.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
      ${cards.map((c) => `
        <div class="card home-stat-card" data-goto="${c.key}" style="cursor:pointer;">
          <div style="font-size:2.2rem; font-weight:700; font-family:'Fraunces', serif; color:var(--canopy);">${c.total}</div>
          <div style="font-weight:600; margin-bottom:0.15rem;">${c.label}</div>
          <div class="mono" style="color:var(--muted); font-size:0.8rem;">${c.sub}</div>
        </div>
      `).join('')}
    </div>
    <p style="color:var(--muted); font-size:0.85rem;">Click a card to jump to that section.</p>
  `;

  wrap.querySelectorAll('[data-goto]').forEach((card) =>
    card.addEventListener('click', () => switchTab(card.dataset.goto))
  );
}

// ---------- admin access ----------

async function loadAdmins() {
  const view = document.getElementById('admins-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;">
      <button class="btn-primary" id="new-admin-btn">+ Add admin</button>
    </div>
    <div id="admins-table-wrap">Loading…</div>
  `;
  document.getElementById('new-admin-btn').addEventListener('click', openAddAdminModal);

  try {
    const admins = await api('/api/admin-users');
    renderAdminsTable(admins);
  } catch (e) {
    document.getElementById('admins-table-wrap').innerHTML = `<div class="empty-state">Could not load admin accounts.</div>`;
  }
}

function renderAdminsTable(admins) {
  const wrap = document.getElementById('admins-table-wrap');
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Created</th><th>Username</th><th></th></tr></thead>
      <tbody>
        ${admins.map((a) => `
          <tr>
            <td class="mono">${fmtDate(a.created_at)}</td>
            <td>${escapeHtml(a.username)}${a.id === currentAdminId ? ' <span class="pill pill-approved">You</span>' : ''}</td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-edit-admin="${a.id}" data-username="${escapeHtml(a.username)}" style="margin-right:0.4rem;">Edit</button>
              ${a.id === currentAdminId
                ? `<span style="color:var(--muted); font-size:0.82rem;">Can't remove your own account</span>`
                : `<button class="btn-danger" data-delete-admin="${a.id}" data-username="${escapeHtml(a.username)}">Remove</button>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="color:var(--muted); font-size:0.82rem; margin-top:0.75rem;">
      Anyone added here can sign in to this entire admin panel — applications, events, community moderation, everything. Only add people you trust with full access.
    </p>
  `;

  wrap.querySelectorAll('[data-edit-admin]').forEach((btn) =>
    btn.addEventListener('click', () => openEditAdminModal(btn.dataset.editAdmin, btn.dataset.username))
  );

  wrap.querySelectorAll('[data-delete-admin]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove admin access for "${btn.dataset.username}"? They'll be signed out immediately.`)) return;
      try {
        await api(`/api/admin-users/${btn.dataset.deleteAdmin}`, { method: 'DELETE' });
        toast('Admin removed.');
        loadAdmins();
      } catch (err) {
        alert(`Could not remove: ${err.message}`);
      }
    })
  );
}

function openEditAdminModal(id, currentUsername) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit admin</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <label>Username</label>
        <input id="edit-admin-username" value="${escapeHtml(currentUsername)}" />
        <label>New password (optional)</label>
        <input id="edit-admin-password" type="password" placeholder="Leave blank to keep current password" />
        <div class="error-text" id="edit-admin-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-admin-btn">Save changes</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-admin-btn').addEventListener('click', async () => {
    const username = document.getElementById('edit-admin-username').value.trim();
    const password = document.getElementById('edit-admin-password').value;
    const errorEl = document.getElementById('edit-admin-error');
    errorEl.textContent = '';

    if (!username) {
      errorEl.textContent = 'Username cannot be empty.';
      return;
    }

    const payload = { username };
    if (password) payload.password = password;

    try {
      await api(`/api/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('Admin updated.');
      closeModal();
      loadAdmins();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function openAddAdminModal() {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Add admin</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <label>Username</label>
        <input id="new-admin-username" />
        <label>Password</label>
        <input id="new-admin-password" type="password" placeholder="At least 8 characters" />
        <div class="error-text" id="new-admin-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="create-admin-btn">Add admin</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('create-admin-btn').addEventListener('click', async () => {
    const username = document.getElementById('new-admin-username').value.trim();
    const password = document.getElementById('new-admin-password').value;
    const errorEl = document.getElementById('new-admin-error');
    errorEl.textContent = '';

    try {
      await api('/api/admin-users', { method: 'POST', body: JSON.stringify({ username, password }) });
      toast('Admin added.');
      closeModal();
      loadAdmins();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ---------- donations ----------

let donationFilters = {};

async function loadDonations() {
  const view = document.getElementById('donations-view');
  view.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
      <button class="btn-primary" id="new-donation-btn">+ Add donation</button>
      <button class="btn-secondary" id="export-donations-btn">Export CSV</button>
    </div>
    <div class="filters">
      <input type="date" id="donation-from" title="From date" />
      <input type="date" id="donation-to" title="To date" />
      <select id="donation-method-filter">
        <option value="">All methods</option>
        ${Object.entries(DONATION_METHOD_LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
      </select>
      <button class="btn-secondary" id="donation-filter-apply">Filter</button>
      <button class="btn-ghost" id="donation-filter-clear">Clear</button>
    </div>
    <div id="donations-summary-wrap" style="margin-bottom:1.25rem;"></div>
    <div id="donations-table-wrap">Loading…</div>
  `;

  document.getElementById('new-donation-btn').addEventListener('click', () => openDonationModal());
  document.getElementById('export-donations-btn').addEventListener('click', exportDonationsCsv);
  document.getElementById('donation-filter-apply').addEventListener('click', () => {
    donationFilters = {
      from: document.getElementById('donation-from').value || undefined,
      to: document.getElementById('donation-to').value || undefined,
      method: document.getElementById('donation-method-filter').value || undefined,
    };
    refreshDonations();
  });
  document.getElementById('donation-filter-clear').addEventListener('click', () => {
    donationFilters = {};
    document.getElementById('donation-from').value = '';
    document.getElementById('donation-to').value = '';
    document.getElementById('donation-method-filter').value = '';
    refreshDonations();
  });

  refreshDonations();
}

function donationQueryString() {
  const params = new URLSearchParams();
  Object.entries(donationFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

async function refreshDonations() {
  const qs = donationQueryString();

  try {
    const [donations, summary] = await Promise.all([
      api(`/api/donations${qs ? `?${qs}` : ''}`),
      api(`/api/donations/summary${qs ? `?${qs}` : ''}`),
    ]);
    renderDonationsSummary(summary);
    renderDonationsTable(donations);
  } catch (e) {
    document.getElementById('donations-table-wrap').innerHTML = `<div class="empty-state">Could not load donations.</div>`;
  }
}

function renderDonationsSummary(summary) {
  const wrap = document.getElementById('donations-summary-wrap');
  const methodBreakdown = Object.entries(summary.by_method)
    .filter(([, amount]) => amount > 0)
    .map(([method, amount]) => `${DONATION_METHOD_LABELS[method]}: $${amount.toFixed(2)}`)
    .join(' · ');

  wrap.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem;">
      <div class="card">
        <div style="font-size:1.8rem; font-weight:700; font-family:'Fraunces', serif; color:var(--canopy);">$${summary.total.toFixed(2)}</div>
        <div style="font-weight:600; margin-bottom:0.15rem;">Total (filtered)</div>
        <div class="mono" style="color:var(--muted); font-size:0.8rem;">${summary.count} donation${summary.count === 1 ? '' : 's'}</div>
      </div>
      <div class="card">
        <div style="font-size:1.8rem; font-weight:700; font-family:'Fraunces', serif; color:var(--canopy);">$${summary.average.toFixed(2)}</div>
        <div style="font-weight:600; margin-bottom:0.15rem;">Average gift</div>
        <div class="mono" style="color:var(--muted); font-size:0.8rem;">${methodBreakdown || 'no donations yet'}</div>
      </div>
      <div class="card">
        <div style="font-weight:600; margin-bottom:0.4rem;">Top donors</div>
        ${summary.top_donors.length === 0
          ? `<div class="mono" style="color:var(--muted); font-size:0.8rem;">No donations yet</div>`
          : summary.top_donors.slice(0, 3).map((d) => `
              <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.2rem;">
                <span>${escapeHtml(d.donor_name)}</span><span class="mono">$${d.total.toFixed(2)}</span>
              </div>
            `).join('')}
      </div>
    </div>
  `;
}

function renderDonationsTable(donations) {
  const wrap = document.getElementById('donations-table-wrap');
  if (donations.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No donations logged yet. Add your first one above.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Donor</th><th>Amount</th><th>Method</th><th>Campaign</th><th></th></tr></thead>
      <tbody>
        ${donations.map((d) => `
          <tr>
            <td class="mono">${escapeHtml(d.donation_date)}</td>
            <td>${escapeHtml(d.donor_name)}${d.is_recurring ? ' <span class="pill pill-approved">Recurring</span>' : ''}</td>
            <td class="mono">$${d.amount.toFixed(2)}</td>
            <td>${DONATION_METHOD_LABELS[d.method] || d.method}</td>
            <td>${escapeHtml(d.campaign || '—')}</td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-edit-donation="${d.id}" style="margin-right:0.4rem;">Edit</button>
              <button class="btn-danger" data-delete-donation="${d.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit-donation]').forEach((btn) =>
    btn.addEventListener('click', () => openDonationModal(donations.find((d) => d.id == btn.dataset.editDonation)))
  );
  wrap.querySelectorAll('[data-delete-donation]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this donation record permanently?')) return;
      try {
        await api(`/api/donations/${btn.dataset.deleteDonation}`, { method: 'DELETE' });
        toast('Donation deleted.');
        refreshDonations();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

function openDonationModal(donation) {
  const isEdit = Boolean(donation);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit donation' : 'Log donation'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="field-grid">
          <div class="half"><label>Donor name</label><input id="d-name" value="${escapeHtml(donation?.donor_name || '')}" /></div>
          <div class="half"><label>Donor email (optional)</label><input id="d-email" value="${escapeHtml(donation?.donor_email || '')}" /></div>
          <div class="half"><label>Amount ($)</label><input id="d-amount" type="number" step="0.01" min="0.01" value="${donation?.amount ?? ''}" /></div>
          <div class="half"><label>Date</label><input id="d-date" type="date" value="${donation?.donation_date || new Date().toISOString().slice(0, 10)}" /></div>
          <div class="half"><label>Method</label>
            <select id="d-method">
              ${Object.entries(DONATION_METHOD_LABELS).map(([val, label]) =>
                `<option value="${val}" ${(donation?.method || 'other') === val ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="half"><label>Campaign (optional)</label><input id="d-campaign" value="${escapeHtml(donation?.campaign || '')}" placeholder="e.g. Spring appeal" /></div>
          <div><label><input type="checkbox" id="d-recurring" style="width:auto; display:inline-block; margin-right:0.4rem;" ${donation?.is_recurring ? 'checked' : ''}/> Recurring donor</label></div>
          <div><label>Notes (optional)</label><textarea id="d-notes" rows="2">${escapeHtml(donation?.notes || '')}</textarea></div>
        </div>
        <div class="error-text" id="donation-error"></div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-donation">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-donation">${isEdit ? 'Save changes' : 'Log donation'}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-donation').addEventListener('click', async () => {
    const errorEl = document.getElementById('donation-error');
    errorEl.textContent = '';
    const payload = {
      donor_name: document.getElementById('d-name').value.trim(),
      donor_email: document.getElementById('d-email').value.trim(),
      amount: Number(document.getElementById('d-amount').value),
      donation_date: document.getElementById('d-date').value,
      method: document.getElementById('d-method').value,
      campaign: document.getElementById('d-campaign').value.trim(),
      is_recurring: document.getElementById('d-recurring').checked,
      notes: document.getElementById('d-notes').value.trim(),
    };

    if (!payload.donor_name) return (errorEl.textContent = 'Donor name is required.');
    if (!payload.amount || payload.amount <= 0) return (errorEl.textContent = 'Enter a valid amount.');
    if (!payload.donation_date) return (errorEl.textContent = 'Date is required.');

    try {
      if (isEdit) {
        await api(`/api/donations/${donation.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Donation updated.');
      } else {
        await api('/api/donations', { method: 'POST', body: JSON.stringify(payload) });
        toast('Donation logged.');
      }
      closeModal();
      refreshDonations();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  if (isEdit) {
    document.getElementById('delete-donation').addEventListener('click', async () => {
      if (!confirm('Delete this donation record permanently?')) return;
      try {
        await api(`/api/donations/${donation.id}`, { method: 'DELETE' });
        toast('Donation deleted.');
        closeModal();
        refreshDonations();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

function exportDonationsCsv() {
  const qs = donationQueryString();
  window.open(`${API_BASE}/api/donations/export${qs ? `?${qs}` : ''}`, '_blank');
}

// ---------- volunteers & fosters ----------

async function loadVolunteers() {
  const view = document.getElementById('volunteers-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
      <button class="btn-primary" id="new-volunteer-btn">+ Add volunteer</button>
      <select id="volunteer-status-filter" style="width:auto;">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
    <div id="volunteers-table-wrap">Loading…</div>
  `;
  document.getElementById('new-volunteer-btn').addEventListener('click', () => openVolunteerModal());
  document.getElementById('volunteer-status-filter').addEventListener('change', (e) => refreshVolunteers(e.target.value || undefined));

  refreshVolunteers();
}

async function refreshVolunteers(status) {
  try {
    const volunteers = await api(`/api/volunteers${status ? `?status=${status}` : ''}`);
    renderVolunteersTable(volunteers);
  } catch (e) {
    document.getElementById('volunteers-table-wrap').innerHTML = `<div class="empty-state">Could not load volunteers.</div>`;
  }
}

function renderVolunteersTable(volunteers) {
  const wrap = document.getElementById('volunteers-table-wrap');
  if (volunteers.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No volunteers on the roster yet. Add one above, or use "Add to volunteer roster" from an approved volunteer application.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Active fosters</th><th>Total hours</th><th></th></tr></thead>
      <tbody>
        ${volunteers.map((v) => `
          <tr class="clickable" data-id="${v.id}">
            <td>${escapeHtml(v.full_name)}</td>
            <td class="mono" style="font-size:0.82rem;">${escapeHtml(v.email || '—')}${v.phone ? `<br/>${escapeHtml(v.phone)}` : ''}</td>
            <td><span class="pill ${v.status === 'active' ? 'pill-approved' : 'pill-archived'}">${VOLUNTEER_STATUS_LABELS[v.status]}</span></td>
            <td>${v.active_fosters}</td>
            <td class="mono">${v.total_hours}</td>
            <td></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) =>
    row.addEventListener('click', () => openVolunteerDetail(row.dataset.id))
  );
}

function openVolunteerModal(volunteer) {
  const isEdit = Boolean(volunteer);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit volunteer' : 'Add volunteer'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="field-grid">
          <div><label>Full name</label><input id="v-name" value="${escapeHtml(volunteer?.full_name || '')}" /></div>
          <div class="half"><label>Email</label><input id="v-email" value="${escapeHtml(volunteer?.email || '')}" /></div>
          <div class="half"><label>Phone</label><input id="v-phone" value="${escapeHtml(volunteer?.phone || '')}" /></div>
          <div class="half"><label>Status</label>
            <select id="v-status">
              <option value="active" ${(!volunteer || volunteer.status === 'active') ? 'selected' : ''}>Active</option>
              <option value="inactive" ${volunteer?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="half"><label>Joined</label><input id="v-joined" type="date" value="${volunteer?.joined_date || new Date().toISOString().slice(0, 10)}" /></div>
          <div><label>Skills / interests (optional)</label><input id="v-skills" value="${escapeHtml(volunteer?.skills || '')}" /></div>
          <div><label>Notes (optional)</label><textarea id="v-notes" rows="2">${escapeHtml(volunteer?.notes || '')}</textarea></div>
        </div>
        <div class="error-text" id="volunteer-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-volunteer">${isEdit ? 'Save changes' : 'Add volunteer'}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-volunteer').addEventListener('click', async () => {
    const errorEl = document.getElementById('volunteer-error');
    errorEl.textContent = '';
    const payload = {
      full_name: document.getElementById('v-name').value.trim(),
      email: document.getElementById('v-email').value.trim(),
      phone: document.getElementById('v-phone').value.trim(),
      status: document.getElementById('v-status').value,
      joined_date: document.getElementById('v-joined').value,
      skills: document.getElementById('v-skills').value.trim(),
      notes: document.getElementById('v-notes').value.trim(),
    };

    if (!payload.full_name) return (errorEl.textContent = 'Full name is required.');

    try {
      if (isEdit) {
        await api(`/api/volunteers/${volunteer.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Volunteer updated.');
      } else {
        await api('/api/volunteers', { method: 'POST', body: JSON.stringify(payload) });
        toast('Volunteer added.');
      }
      closeModal();
      refreshVolunteers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

async function openVolunteerDetail(id) {
  const v = await api(`/api/volunteers/${id}`);

  const fostersHtml = v.fosters.length === 0
    ? `<div class="mono" style="color:var(--muted); font-size:0.85rem; margin-bottom:0.75rem;">No foster history yet.</div>`
    : `<table style="margin-bottom:0.75rem;">
        <thead><tr><th>Bird</th><th>Start</th><th>End</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${v.fosters.map((f) => `
            <tr>
              <td>${escapeHtml(f.bird_name)} <span class="mono" style="color:var(--muted); font-size:0.78rem;">(${escapeHtml(f.bird_species)})</span></td>
              <td class="mono">${escapeHtml(f.start_date)}</td>
              <td>${f.end_date ? `<span class="mono">${escapeHtml(f.end_date)}</span>` : `<span class="pill pill-approved">Ongoing</span>`}</td>
              <td style="font-size:0.85rem;">${escapeHtml(f.notes || '—')}</td>
              <td style="white-space:nowrap;">
                ${!f.end_date ? `<button class="btn-secondary" data-end-foster="${f.id}" style="font-size:0.8rem; padding:0.35rem 0.7rem;">End foster</button>` : ''}
                <button class="btn-danger" data-delete-foster="${f.id}" style="font-size:0.8rem; padding:0.35rem 0.7rem;">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  const hoursHtml = v.hours.length === 0
    ? `<div class="mono" style="color:var(--muted); font-size:0.85rem; margin-bottom:0.75rem;">No hours logged yet.</div>`
    : `<table style="margin-bottom:0.75rem;">
        <thead><tr><th>Date</th><th>Hours</th><th>Activity</th><th></th></tr></thead>
        <tbody>
          ${v.hours.map((h) => `
            <tr>
              <td class="mono">${escapeHtml(h.log_date)}</td>
              <td class="mono">${h.hours}</td>
              <td style="font-size:0.85rem;">${escapeHtml(h.activity || '—')}</td>
              <td><button class="btn-danger" data-delete-hours="${h.id}" style="font-size:0.8rem; padding:0.35rem 0.7rem;">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:720px;">
        <div class="modal-header">
          <h3>${escapeHtml(v.full_name)}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <p class="mono" style="color:var(--muted); font-size:0.82rem;">
          ${escapeHtml(v.email || 'no email')} ${v.phone ? `· ${escapeHtml(v.phone)}` : ''} · Joined ${escapeHtml(v.joined_date)}
          · <span class="pill ${v.status === 'active' ? 'pill-approved' : 'pill-archived'}">${VOLUNTEER_STATUS_LABELS[v.status]}</span>
        </p>
        ${v.skills ? `<p style="font-size:0.9rem; margin-bottom:0.5rem;"><strong>Skills/interests:</strong> ${escapeHtml(v.skills)}</p>` : ''}
        ${v.notes ? `<p style="font-size:0.9rem; margin-bottom:0.5rem;"><strong>Notes:</strong> ${escapeHtml(v.notes)}</p>` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin:1.25rem 0 0.5rem;">
          <h4 style="margin:0;">Foster history</h4>
          <button class="btn-secondary" id="assign-foster-btn" style="font-size:0.82rem;">+ Assign a bird</button>
        </div>
        ${fostersHtml}

        <div style="display:flex; justify-content:space-between; align-items:center; margin:1.25rem 0 0.5rem;">
          <h4 style="margin:0;">Hours logged (total: ${v.total_hours})</h4>
          <button class="btn-secondary" id="log-hours-btn" style="font-size:0.82rem;">+ Log hours</button>
        </div>
        ${hoursHtml}

        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          <button class="btn-danger" id="delete-volunteer">Remove from roster</button>
          <button class="btn-secondary" id="edit-volunteer-btn">Edit details</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('edit-volunteer-btn').addEventListener('click', () => openVolunteerModal(v));
  document.getElementById('assign-foster-btn').addEventListener('click', () => openAssignFosterModal(v.id));
  document.getElementById('log-hours-btn').addEventListener('click', () => openLogHoursModal(v.id));

  document.getElementById('delete-volunteer').addEventListener('click', async () => {
    if (!confirm(`Remove ${v.full_name} from the volunteer roster? This also deletes their foster history and hours log.`)) return;
    try {
      await api(`/api/volunteers/${v.id}`, { method: 'DELETE' });
      toast('Volunteer removed.');
      closeModal();
      refreshVolunteers();
    } catch (err) {
      alert(`Could not remove: ${err.message}`);
    }
  });

  document.querySelectorAll('[data-end-foster]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/volunteers/fosters/${btn.dataset.endFoster}`, {
          method: 'PATCH',
          body: JSON.stringify({ end_date: new Date().toISOString().slice(0, 10) }),
        });
        toast('Foster ended.');
        openVolunteerDetail(id);
        refreshVolunteers();
      } catch (err) {
        alert(`Could not update: ${err.message}`);
      }
    })
  );

  document.querySelectorAll('[data-delete-foster]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this foster record permanently?')) return;
      try {
        await api(`/api/volunteers/fosters/${btn.dataset.deleteFoster}`, { method: 'DELETE' });
        toast('Foster record removed.');
        openVolunteerDetail(id);
        refreshVolunteers();
      } catch (err) {
        alert(`Could not remove: ${err.message}`);
      }
    })
  );

  document.querySelectorAll('[data-delete-hours]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this hours entry permanently?')) return;
      try {
        await api(`/api/volunteers/hours/${btn.dataset.deleteHours}`, { method: 'DELETE' });
        toast('Hours entry deleted.');
        openVolunteerDetail(id);
        refreshVolunteers();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

async function openAssignFosterModal(volunteerId) {
  let birds = [];
  try {
    birds = await api('/api/birds?all=1');
  } catch (e) {
    alert('Could not load birds.');
    return;
  }

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Assign a foster bird</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <label>Bird</label>
        <select id="foster-bird">
          ${birds.map((b) => `<option value="${b.id}">${escapeHtml(b.name)} (${escapeHtml(b.species)}) — ${BIRD_STATUS_LABELS[b.status]}</option>`).join('')}
        </select>
        <label>Start date</label>
        <input id="foster-start" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        <label>Notes (optional)</label>
        <textarea id="foster-notes" rows="2"></textarea>
        <div class="error-text" id="foster-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-foster">Assign</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-foster').addEventListener('click', async () => {
    const errorEl = document.getElementById('foster-error');
    if (birds.length === 0) return (errorEl.textContent = 'No birds available to assign.');
    try {
      await api(`/api/volunteers/${volunteerId}/fosters`, {
        method: 'POST',
        body: JSON.stringify({
          bird_id: Number(document.getElementById('foster-bird').value),
          start_date: document.getElementById('foster-start').value,
          notes: document.getElementById('foster-notes').value.trim(),
        }),
      });
      toast('Foster assigned.');
      openVolunteerDetail(volunteerId);
      refreshVolunteers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function openLogHoursModal(volunteerId) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Log volunteer hours</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <label>Date</label>
        <input id="hours-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        <label>Hours</label>
        <input id="hours-value" type="number" step="0.25" min="0.25" />
        <label>Activity (optional)</label>
        <input id="hours-activity" placeholder="e.g. Cage cleaning, event staffing" />
        <div class="error-text" id="hours-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-hours">Log hours</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('save-hours').addEventListener('click', async () => {
    const errorEl = document.getElementById('hours-error');
    const payload = {
      log_date: document.getElementById('hours-date').value,
      hours: Number(document.getElementById('hours-value').value),
      activity: document.getElementById('hours-activity').value.trim(),
    };
    if (!payload.log_date) return (errorEl.textContent = 'Date is required.');
    if (!payload.hours || payload.hours <= 0) return (errorEl.textContent = 'Enter a valid number of hours.');

    try {
      await api(`/api/volunteers/${volunteerId}/hours`, { method: 'POST', body: JSON.stringify(payload) });
      toast('Hours logged.');
      openVolunteerDetail(volunteerId);
      refreshVolunteers();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

boot();
