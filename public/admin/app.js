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

  if (tab === 'events') {
    appView.style.display = 'none';
    eventsView.style.display = 'block';
    loadEvents();
  } else {
    appView.style.display = 'block';
    eventsView.style.display = 'none';
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

boot();
