const API_BASE = window.location.origin;

const STATUS_LABELS = {
  new: 'New',
  in_review: 'In review',
  approved: 'Approved',
  declined: 'Declined',
  archived: 'Archived',
};

const TAB_TITLES = {
  adoption: 'Adoption applications',
  relinquishment: 'Relinquishment applications',
  volunteer: 'Volunteer applications',
  events: 'Events',
  announcements: 'News announcements',
};

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

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') + 'Z' : iso);
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

async function boot() {
  try {
    const me = await api('/api/auth/me');
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

  switchTab('adoption');
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('view-title').textContent = TAB_TITLES[tab];

  const appView = document.getElementById('app-view');
  const eventsView = document.getElementById('events-view');
  const announcementsView = document.getElementById('announcements-view');

  appView.style.display = 'none';
  eventsView.style.display = 'none';
  announcementsView.style.display = 'none';

  if (tab === 'events') {
    eventsView.style.display = 'block';
    loadEvents();
  } else if (tab === 'announcements') {
    announcementsView.style.display = 'block';
    loadAnnouncements();
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
    .map(([key, value]) => `<div style="margin-bottom:0.5rem;"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`)
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
    await api(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, admin_notes }) });
    toast('Application updated.');
    closeModal();
    loadApplications(currentTab);
  });

  document.getElementById('delete-app').addEventListener('click', async () => {
    if (!confirm('Delete this application permanently?')) return;
    await api(`/api/applications/${id}`, { method: 'DELETE' });
    toast('Application deleted.');
    closeModal();
    loadApplications(currentTab);
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

    if (isEdit) {
      await api(`/api/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('Event updated.');
    } else {
      await api('/api/events', { method: 'POST', body: JSON.stringify(payload) });
      toast('Event created.');
    }
    closeModal();
    loadEvents();
  });

  if (isEdit) {
    document.getElementById('delete-event').addEventListener('click', async () => {
      if (!confirm('Delete this event and all its RSVPs?')) return;
      await api(`/api/events/${event.id}`, { method: 'DELETE' });
      toast('Event deleted.');
      closeModal();
      loadEvents();
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

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Created</th><th>Title</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.map((a, i) => `
          <tr>
            <td class="mono">${fmtDate(a.created_at)}</td>
            <td>${escapeHtml(a.title)}${i === 0 && a.is_published ? ' <span class="pill pill-approved">Live on site</span>' : ''}</td>
            <td><span class="pill ${a.is_published ? 'pill-approved' : 'pill-archived'}">${a.is_published ? 'Published' : 'Draft'}</span></td>
            <td style="white-space:nowrap;"><button class="btn-secondary" data-edit="${a.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="color:var(--muted); font-size:0.82rem; margin-top:0.75rem;">
      The homepage banner always shows only the newest <em>published</em> announcement, so older ones here are just kept as a history — no need to delete them.
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
      link_url: document.getElementById('an-link-url').value.trim(),
      link_text: document.getElementById('an-link-text').value.trim(),
      is_published: document.getElementById('an-published').value === '1',
    };

    if (!payload.title || !payload.message) {
      alert('Title and message are required.');
      return;
    }

    if (isEdit) {
      await api(`/api/announcements/${announcement.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('Announcement updated.');
    } else {
      await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
      toast('Announcement created.');
    }
    closeModal();
    loadAnnouncements();
  });

  if (isEdit) {
    document.getElementById('delete-announcement').addEventListener('click', async () => {
      if (!confirm('Delete this announcement permanently?')) return;
      await api(`/api/announcements/${announcement.id}`, { method: 'DELETE' });
      toast('Announcement deleted.');
      closeModal();
      loadAnnouncements();
    });
  }
}

boot();
