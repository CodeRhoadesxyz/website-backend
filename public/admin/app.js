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
  community: 'Community',
  admins: 'Admin access',
};

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
  const communityView = document.getElementById('community-view');
  const adminsView = document.getElementById('admins-view');

  homeView.style.display = 'none';
  appView.style.display = 'none';
  eventsView.style.display = 'none';
  announcementsView.style.display = 'none';
  birdsView.style.display = 'none';
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
        <tr><th>Submitted</th><th>Name</th><th>Email</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${apps.map((app) => `
          <tr class="clickable" data-id="${app.id}">
            <td class="mono">${fmtDate(app.created_at)}</td>
            <td>${escapeHtml(app.data.fullName || '—')}</td>
            <td>${escapeHtml(app.data.email || '—')}</td>
            <td><span class="pill pill-${app.status}">${STATUS_LABELS[app.status]}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openApplicationModal(row.dataset.id));
  });
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
        <div class="card">${fields}</div>

        <label for="status-select">Status</label>
        <select id="status-select">
          ${Object.entries(STATUS_LABELS).map(([val, label]) =>
            `<option value="${val}" ${app.status === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>

        <label for="notes-field">Internal notes</label>
        <textarea id="notes-field" rows="3">${escapeHtml(app.admin_notes || '')}</textarea>

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
              <button class="btn-secondary" data-toggle-ban="${u.id}" data-banned="${u.is_banned}" style="margin-right:0.4rem;">${u.is_banned ? 'Unsuspend' : 'Suspend'}</button>
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

boot();
