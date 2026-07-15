const API_BASE = window.location.origin;

const STATUS_LABELS = {
  new: 'New',
  in_review: 'In review',
  needs_info: 'Needs info from applicant',
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
  fosters: 'Fosters',
  wishlist: 'Wishlist',
  testimonials: 'Testimonials',
  faqs: 'FAQs',
  store: 'Store',
};

// Tabs that can be individually granted/restricted per admin — everything
// in the sidebar except Home (always visible, read-only overview) and
// Admins (hardcoded to the super admin only, never delegable).
const PERMISSION_TABS = [
  'adoption', 'relinquishment', 'volunteer', 'birds', 'fosters', 'events',
  'announcements', 'wishlist', 'testimonials', 'faqs', 'store', 'community',
];

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

// ---------- image upload (used by birds/events/announcements forms) ----------

function imageFieldHtml(inputId, currentUrl, label) {
  return `
    <label>${label}</label>
    <div style="display:flex; gap:0.5rem; align-items:center;">
      <input id="${inputId}" value="${escapeHtml(currentUrl || '')}" placeholder="https://... or upload a file" style="flex:1;" />
      <button type="button" class="btn-secondary" id="${inputId}-upload-btn" style="white-space:nowrap;">Upload…</button>
    </div>
    <input type="file" id="${inputId}-file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;" />
    <div id="${inputId}-preview" style="margin-top:0.5rem;">
      ${currentUrl ? `<img src="${escapeHtml(currentUrl)}" style="max-height:80px; border-radius:8px;" />` : ''}
    </div>
  `;
}

function attachImageUploadHandlers(inputId) {
  const fileInput = document.getElementById(`${inputId}-file`);
  const uploadBtn = document.getElementById(`${inputId}-upload-btn`);
  const urlInput = document.getElementById(inputId);
  const preview = document.getElementById(`${inputId}-preview`);

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';

    try {
      const formData = new FormData();
      formData.append('image', file);
      // Not using the api() helper here since it always sets
      // Content-Type: application/json, which breaks a multipart upload —
      // the browser needs to set its own boundary header for FormData.
      const res = await fetch(`${window.location.origin}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');

      const fullUrl = `${window.location.origin}${data.url}`;
      urlInput.value = fullUrl;
      preview.innerHTML = `<img src="${fullUrl}" style="max-height:80px; border-radius:8px;" />`;
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload…';
      fileInput.value = '';
    }
  });
}

// ---------- boot ----------

let currentAdminId = null;
let currentAdminMe = null;

function canViewTab(tab) {
  if (!currentAdminMe || currentAdminMe.is_super_admin) return true;
  const perms = currentAdminMe.tab_permissions;
  if (!perms || !perms[tab]) return true;
  return perms[tab].view !== false;
}

function canEditTab(tab) {
  if (!currentAdminMe || currentAdminMe.is_super_admin) return true;
  const perms = currentAdminMe.tab_permissions;
  if (!perms || !perms[tab]) return true;
  return perms[tab].edit !== false;
}

async function boot() {
  try {
    const me = await api('/api/auth/me');
    currentAdminId = me.id;
    currentAdminMe = me;
    document.getElementById('signed-in-as').textContent = `Signed in as ${me.username}`;
  } catch (e) {
    return; // api() already redirected
  }

  // Hide sidebar tabs this admin can't view at all, and the Admins tab
  // entirely for anyone but the super admin — that one isn't part of the
  // regular per-tab system, it's hardcoded (see requireSuperAdmin).
  document.querySelectorAll('.nav-tab[data-tab]').forEach((el) => {
    const tab = el.dataset.tab;
    if (tab === 'admins') {
      el.style.display = currentAdminMe.is_super_admin ? '' : 'none';
    } else if (tab !== 'home' && !canViewTab(tab)) {
      el.style.display = 'none';
    }
  });

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
  if (tab === 'admins' && !(currentAdminMe && currentAdminMe.is_super_admin)) {
    toast("Admin access is restricted to the super admin.");
    tab = 'home';
  } else if (tab !== 'home' && tab !== 'admins' && !canViewTab(tab)) {
    toast("You don't have access to that tab. Ask your super admin for access.");
    tab = 'home';
  }

  currentTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('view-title').textContent = TAB_TITLES[tab];

  const viewIds = [
    'home-view', 'app-view', 'events-view', 'announcements-view', 'birds-view',
    'community-view', 'admins-view', 'fosters-view', 'wishlist-view', 'testimonials-view', 'faqs-view', 'store-view',
  ];
  viewIds.forEach((id) => { document.getElementById(id).style.display = 'none'; });

  const showAndLoad = (id, loadFn) => {
    document.getElementById(id).style.display = 'block';
    loadFn();
    // View-only tabs (view allowed, edit not) get a small heads-up banner.
    // The server is what actually enforces this — this is just so the
    // person isn't surprised when an Add/Edit/Delete button fails.
    if (tab !== 'home' && tab !== 'admins' && canViewTab(tab) && !canEditTab(tab)) {
      const container = document.getElementById(id);
      const banner = document.createElement('div');
      banner.className = 'empty-state';
      banner.style.cssText = 'margin-bottom:1rem; text-align:left; padding:0.75rem 1rem;';
      banner.textContent = "View only — you can look but not add, edit, or delete here. Ask your super admin for edit access.";
      container.prepend(banner);
    }
  };

  if (tab === 'home') showAndLoad('home-view', loadHome);
  else if (tab === 'events') showAndLoad('events-view', loadEvents);
  else if (tab === 'announcements') showAndLoad('announcements-view', loadAnnouncements);
  else if (tab === 'birds') showAndLoad('birds-view', loadBirds);
  else if (tab === 'community') showAndLoad('community-view', loadCommunity);
  else if (tab === 'admins') showAndLoad('admins-view', loadAdmins);
  else if (tab === 'fosters') showAndLoad('fosters-view', loadFosters);
  else if (tab === 'wishlist') showAndLoad('wishlist-view', loadWishlist);
  else if (tab === 'testimonials') showAndLoad('testimonials-view', loadTestimonials);
  else if (tab === 'faqs') showAndLoad('faqs-view', loadFaqs);
  else if (tab === 'store') showAndLoad('store-view', loadStore);
  else {
    document.getElementById('app-view').style.display = 'block';
    loadApplications(tab);
    if (canViewTab(tab) && !canEditTab(tab)) {
      const container = document.getElementById('app-view');
      const banner = document.createElement('div');
      banner.className = 'empty-state';
      banner.style.cssText = 'margin-bottom:1rem; text-align:left; padding:0.75rem 1rem;';
      banner.textContent = "View only — you can look but not edit or delete here. Ask your super admin for edit access.";
      container.prepend(banner);
    }
  }
}

// ---------- applications ----------

async function loadApplications(type, statusFilter, searchTerm) {
  const appView = document.getElementById('app-view');
  appView.innerHTML = `
    <div class="filters">
      <select id="status-filter">
        <option value="">All statuses</option>
        ${Object.entries(STATUS_LABELS).map(([val, label]) =>
          `<option value="${val}" ${statusFilter === val ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
      <input id="app-search" type="search" placeholder="Search name, email, phone…" value="${escapeHtml(searchTerm || '')}" style="max-width:260px;" />
      <button class="btn-secondary" id="export-csv-btn">Export CSV</button>
    </div>
    <div id="app-table-wrap">Loading…</div>
  `;

  document.getElementById('status-filter').addEventListener('change', (e) => {
    loadApplications(type, e.target.value || undefined, searchTerm);
  });

  let searchDebounce;
  document.getElementById('app-search').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadApplications(type, statusFilter, e.target.value || undefined), 350);
  });

  let params = `type=${type}`;
  if (statusFilter) params += `&status=${statusFilter}`;
  if (searchTerm) params += `&search=${encodeURIComponent(searchTerm)}`;

  try {
    const apps = await api(`/api/applications?${params}`);
    renderApplicationsTable(apps);
    document.getElementById('export-csv-btn').addEventListener('click', () => exportApplicationsCsv(apps, type));
  } catch (e) {
    document.getElementById('app-table-wrap').innerHTML = `<div class="empty-state">Could not load applications.</div>`;
  }
}

function downloadCsv(filename, rows) {
  // Minimal, dependency-free CSV writer — quotes any field containing a
  // comma, quote, or newline, and escapes embedded quotes by doubling them.
  const escapeCell = (val) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportApplicationsCsv(apps, type) {
  if (apps.length === 0) {
    alert('Nothing to export.');
    return;
  }
  // Union of every field seen across all rows' data blobs, so the CSV works
  // even though adoption/relinquishment/volunteer forms have different fields.
  const fieldSet = new Set();
  apps.forEach((a) => Object.keys(a.data).forEach((k) => fieldSet.add(k)));
  const fields = Array.from(fieldSet);

  const header = ['id', 'status', 'submitted', ...fields, 'admin_notes'];
  const rows = apps.map((a) => [
    a.id,
    STATUS_LABELS[a.status] || a.status,
    fmtDate(a.created_at),
    ...fields.map((f) => a.data[f] ?? ''),
    a.admin_notes || '',
  ]);

  downloadCsv(`${type}-applications-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
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
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3>Application #${app.id}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
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

        <div style="display:flex; justify-content:space-between; margin-top:1.25rem; margin-bottom:1.5rem;">
          <button class="btn-danger" id="delete-app">Delete</button>
          <button class="btn-primary" id="save-app">Save changes</button>
        </div>

        <div style="border-top:1px solid var(--line); padding-top:1.25rem;">
          <h4 style="margin-bottom:0.5rem;">Conversation</h4>
          ${app.user_id
            ? ''
            : `<p style="color:var(--muted); font-size:0.82rem; margin-bottom:0.75rem;">
                 This application wasn't submitted while signed in, so it isn't linked to an
                 account — messages sent here won't be visible to the applicant in "My
                 Applications." They'll still need to be reached by email/phone directly.
               </p>`}
          <div id="app-messages-wrap">Loading conversation…</div>
          <form id="app-message-form" class="mt-3" style="margin-top:0.75rem;">
            <textarea id="app-message-input" rows="2" placeholder="Write a message…"></textarea>
            <div class="error-text" id="app-message-error"></div>
            <button type="submit" class="btn-secondary" style="margin-top:0.5rem;">Send</button>
          </form>
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

  loadApplicationMessages(id);

  document.getElementById('app-message-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('app-message-input');
    const errorEl = document.getElementById('app-message-error');
    errorEl.textContent = '';
    if (!input.value.trim()) return;

    try {
      await api(`/api/applications/${id}/messages`, { method: 'POST', body: JSON.stringify({ body: input.value.trim() }) });
      input.value = '';
      loadApplicationMessages(id);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

async function loadApplicationMessages(id) {
  const wrap = document.getElementById('app-messages-wrap');
  if (!wrap) return; // modal may have been closed already

  try {
    const messages = await api(`/api/applications/${id}/messages`);
    if (messages.length === 0) {
      wrap.innerHTML = `<p style="color:var(--muted); font-size:0.85rem;">No messages yet — say hello.</p>`;
      return;
    }
    wrap.innerHTML = `
      <div style="max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:0.6rem;">
        ${messages.map((m) => `
          <div style="align-self:${m.sender_type === 'admin' ? 'flex-end' : 'flex-start'}; max-width:80%;">
            <div class="card" style="margin-bottom:0.15rem; padding:0.6rem 0.85rem; ${m.sender_type === 'admin' ? 'background:var(--canopy); color:#10160f;' : ''}">
              ${escapeHtml(m.body)}
            </div>
            <div class="mono" style="font-size:0.72rem; color:var(--muted); text-align:${m.sender_type === 'admin' ? 'right' : 'left'};">
              ${escapeHtml(m.sender_name)} · ${fmtDate(m.created_at)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">Could not load the conversation.</p>`;
  }
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
    btn.addEventListener('click', () => openRsvpModal(btn.dataset.rsvp, events.find((e) => e.id == btn.dataset.rsvp)?.title || 'event'))
  );
}

function openEventModal(event) {
  const isEdit = Boolean(event);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit event' : 'New event'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
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
          <div>${imageFieldHtml('ev-image', event?.image_url, 'Image (optional)')}</div>
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
  attachImageUploadHandlers('ev-image');

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

async function openRsvpModal(eventId, eventTitle) {
  const rsvps = await api(`/api/events/${eventId}/rsvps`);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>RSVPs</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        ${rsvps.length === 0
          ? `<div class="empty-state">No RSVPs yet.</div>`
          : `<div style="margin-bottom:0.75rem; text-align:right;"><button class="btn-secondary" id="export-rsvp-csv-btn">Export CSV</button></div>
            <table>
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

  const exportBtn = document.getElementById('export-rsvp-csv-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const header = ['name', 'email', 'phone', 'guests', 'notes', 'submitted'];
      const rows = rsvps.map((r) => [r.name, r.email, r.phone || '', r.guests, r.notes || '', fmtDate(r.created_at)]);
      const safeTitle = eventTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      downloadCsv(`rsvps-${safeTitle}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
    });
  }
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
              <td style="white-space:nowrap;">
                <button class="btn-secondary" data-edit="${a.id}" style="margin-right:0.3rem;">Edit</button>
                <button class="btn-secondary" data-ann-caption="${a.id}">Caption</button>
              </td>
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
  wrap.querySelectorAll('[data-ann-caption]').forEach((btn) =>
    btn.addEventListener('click', () => openAnnouncementCaptionModal(items.find((a) => a.id == btn.dataset.annCaption)))
  );
}

function openAnnouncementCaptionModal(announcement) {
  const caption = `📢 ${announcement.title}\n\n${announcement.message}${announcement.link_url ? `\n\n${announcement.link_text || 'Learn more'}: ${announcement.link_url}` : ''}\n\n#ParrotRescue #HeartAndSoulParrotRescue`;

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Social caption</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <textarea id="ann-caption-text" rows="6" readonly>${escapeHtml(caption)}</textarea>
        <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
          <button class="btn-primary" id="copy-ann-caption-btn">Copy to clipboard</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  document.getElementById('copy-ann-caption-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast('Caption copied!');
    } catch (err) {
      document.getElementById('ann-caption-text').select();
      alert('Could not auto-copy — text is selected, use Ctrl/Cmd+C.');
    }
  });
}

function openAnnouncementModal(announcement) {
  const isEdit = Boolean(announcement);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit announcement' : 'New announcement'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <label>Title</label>
        <input id="an-title" value="${escapeHtml(announcement?.title || '')}" placeholder="e.g. We're at capacity — foster homes needed" />
        <label>Message</label>
        <textarea id="an-message" rows="3" placeholder="Keep it short — this shows as a slim banner on the homepage.">${escapeHtml(announcement?.message || '')}</textarea>
        ${imageFieldHtml('an-image', announcement?.image_url, 'Image (optional)')}
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
  attachImageUploadHandlers('an-image');

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
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-edit="${b.id}" style="margin-right:0.3rem;">Edit</button>
              <button class="btn-secondary" data-waitlist="${b.id}" style="margin-right:0.3rem;">Waitlist</button>
              <button class="btn-secondary" data-print="${b.id}" style="margin-right:0.3rem;">Print packet</button>
              <button class="btn-secondary" data-caption="${b.id}">Caption</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openBirdModal(birds.find((b) => b.id == btn.dataset.edit)))
  );
  wrap.querySelectorAll('[data-waitlist]').forEach((btn) =>
    btn.addEventListener('click', () => openBirdWaitlistModal(birds.find((b) => b.id == btn.dataset.waitlist)))
  );
  wrap.querySelectorAll('[data-print]').forEach((btn) =>
    btn.addEventListener('click', () => printBirdPacket(birds.find((b) => b.id == btn.dataset.print)))
  );
  wrap.querySelectorAll('[data-caption]').forEach((btn) =>
    btn.addEventListener('click', () => openCaptionModal(birds.find((b) => b.id == btn.dataset.caption)))
  );
}

function openBirdModal(bird) {
  const isEdit = Boolean(bird);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit bird' : 'New bird'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="field-grid">
          <div class="half"><label>Name</label><input id="b-name" value="${escapeHtml(bird?.name || '')}" /></div>
          <div class="half"><label>Species</label><input id="b-species" value="${escapeHtml(bird?.species || '')}" /></div>
          <div class="half"><label>Age (optional)</label><input id="b-age" value="${escapeHtml(bird?.age || '')}" placeholder="e.g. 2 years" /></div>
          <div class="half"><label>Sex (optional)</label><input id="b-sex" value="${escapeHtml(bird?.sex || '')}" placeholder="e.g. Male" /></div>
          <div><label>Description</label><textarea id="b-desc" rows="4">${escapeHtml(bird?.description || '')}</textarea></div>
          <div>${imageFieldHtml('b-photo', bird?.photo_url, 'Photo (optional)')}</div>
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
          <div><label>Sponsor link (optional)</label><input id="b-sponsor" value="${escapeHtml(bird?.sponsor_url || '')}" placeholder="Your PayPal/Stripe/donation link for sponsoring this bird" /></div>
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
  attachImageUploadHandlers('b-photo');

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
      sponsor_url: document.getElementById('b-sponsor').value.trim(),
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

// ---------- bird waitlist / print packet / social caption ----------

async function openBirdWaitlistModal(bird) {
  const entries = await api(`/api/waitlist?bird_id=${bird.id}`);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Waitlist · ${escapeHtml(bird.name)}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        ${entries.length === 0 ? `<div class="empty-state">No one on the waitlist for this bird yet.</div>` : `
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              ${entries.map((e) => `
                <tr>
                  <td>${escapeHtml(e.name)}</td>
                  <td>${escapeHtml(e.email)}</td>
                  <td>${escapeHtml(e.phone || '—')}</td>
                  <td class="mono">${fmtDate(e.created_at)}</td>
                  <td><button class="btn-danger" data-remove-waitlist="${e.id}" style="font-size:0.8rem; padding:0.35rem 0.7rem;">Remove</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  document.querySelectorAll('[data-remove-waitlist]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/waitlist/${btn.dataset.removeWaitlist}`, { method: 'DELETE' });
        closeModal();
        openBirdWaitlistModal(bird);
      } catch (err) {
        alert(`Could not remove: ${err.message}`);
      }
    })
  );
}

function printBirdPacket(bird) {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(bird.name)} — Adoption Packet</title>
      <style>
        body { font-family: Georgia, serif; max-width: 640px; margin: 2rem auto; padding: 0 1.5rem; color: #222; }
        h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
        .meta { color: #666; margin-bottom: 1.5rem; }
        img { width: 100%; max-height: 320px; object-fit: cover; border-radius: 8px; margin-bottom: 1.5rem; }
        h2 { font-size: 1.1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; margin-top: 1.5rem; }
        footer { margin-top: 2.5rem; color: #888; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(bird.name)}</h1>
      <div class="meta">${escapeHtml(bird.species)}${bird.age ? ' · ' + escapeHtml(bird.age) : ''}${bird.sex ? ' · ' + escapeHtml(bird.sex) : ''}</div>
      ${bird.photo_url ? `<img src="${escapeHtml(bird.photo_url)}" alt="${escapeHtml(bird.name)}" />` : ''}
      <h2>About ${escapeHtml(bird.name)}</h2>
      <p>${escapeHtml(bird.description || 'No description on file yet.')}</p>
      <footer>Heart &amp; Soul Parrot Rescue — printed ${new Date().toLocaleDateString()}</footer>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  win.document.close();
}

function openCaptionModal(bird) {
  const caption = `Meet ${bird.name}! 🦜 A ${bird.age ? bird.age + ' old ' : ''}${bird.species}${bird.sex ? ` (${bird.sex})` : ''} looking for a loving forever home.${bird.description ? ' ' + bird.description : ''} Interested in adopting? Visit our website to apply! #AdoptDontShop #ParrotRescue #${bird.species.replace(/[^a-zA-Z0-9]/g, '')}`;

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Social caption · ${escapeHtml(bird.name)}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <textarea id="caption-text" rows="6" readonly>${escapeHtml(caption)}</textarea>
        <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
          <button class="btn-primary" id="copy-caption-btn">Copy to clipboard</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  document.getElementById('copy-caption-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast('Caption copied!');
    } catch (err) {
      document.getElementById('caption-text').select();
      alert('Could not auto-copy — text is selected, use Ctrl/Cmd+C.');
    }
  });
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
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
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
      <thead><tr><th>Joined</th><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Posts</th><th>Comments</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td class="mono">${fmtDate(u.created_at)}</td>
            <td>${escapeHtml(u.display_name)}</td>
            <td class="mono">${escapeHtml(u.username)}</td>
            <td class="mono" style="font-size:0.82rem;">${escapeHtml(u.email || '—')}</td>
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
    { key: 'birds', label: 'Birds in our care', total: stats.birds.total, sub: `${stats.birds.available} available · ${stats.birds.pending} pending` },
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
    <div class="card">
      <h3 style="margin-bottom:0.75rem;">Adoption performance</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1.25rem;">
        <div>
          <div style="font-size:1.6rem; font-weight:700; font-family:'Fraunces', serif; color:var(--canopy);">${stats.birds.adoptionRate}%</div>
          <div class="mono" style="color:var(--muted); font-size:0.8rem;">Adoption rate (${stats.birds.adopted} of ${stats.birds.total} birds)</div>
        </div>
        <div>
          <div style="font-size:1.6rem; font-weight:700; font-family:'Fraunces', serif; color:var(--canopy);">${stats.birds.avgDaysToAdoption != null ? stats.birds.avgDaysToAdoption : '—'}</div>
          <div class="mono" style="color:var(--muted); font-size:0.8rem;">Avg. days to adoption</div>
        </div>
      </div>
    </div>
    <p style="color:var(--muted); font-size:0.85rem; margin-top:1rem;">Click a card to jump to that section.</p>
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
      <thead><tr><th>Created</th><th>Username</th><th>Email</th><th></th></tr></thead>
      <tbody>
        ${admins.map((a) => `
          <tr>
            <td class="mono">${fmtDate(a.created_at)}</td>
            <td>
              ${escapeHtml(a.username)}
              ${a.id === currentAdminId ? ' <span class="pill pill-approved">You</span>' : ''}
              ${a.is_super_admin ? ' <span class="pill pill-new">Super admin</span>' : ''}
            </td>
            <td>${a.email ? escapeHtml(a.email) : '<span style="color:var(--muted);">Not set — can\'t use "forgot password"</span>'}</td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-edit-admin="${a.id}" data-username="${escapeHtml(a.username)}" data-email="${escapeHtml(a.email || '')}" style="margin-right:0.4rem;">Edit</button>
              ${a.is_super_admin ? '' : `<button class="btn-secondary" data-permissions-admin="${a.id}" data-username="${escapeHtml(a.username)}" style="margin-right:0.4rem;">Permissions</button>`}
              ${a.is_super_admin ? '' : `<button class="btn-secondary" data-undo-actions="${a.id}" data-username="${escapeHtml(a.username)}" style="margin-right:0.4rem;">Undo actions</button>`}
              ${a.id === currentAdminId
                ? `<span style="color:var(--muted); font-size:0.82rem;">Can't remove your own account</span>`
                : `<button class="btn-danger" data-delete-admin="${a.id}" data-username="${escapeHtml(a.username)}">Remove</button>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="color:var(--muted); font-size:0.82rem; margin-top:0.75rem;">
      Anyone added here can sign in to the admin panel. By default a new admin can view and edit every tab — use <strong>Permissions</strong> on their row to restrict them to specific tabs. Only the super admin (${currentAdminMe && currentAdminMe.is_super_admin ? escapeHtml(currentAdminMe.username) : 'the account set as SUPER_ADMIN_USERNAME'}) can manage admin accounts or set permissions.
    </p>
  `;

  wrap.querySelectorAll('[data-edit-admin]').forEach((btn) =>
    btn.addEventListener('click', () => openEditAdminModal(btn.dataset.editAdmin, btn.dataset.username, btn.dataset.email))
  );

  wrap.querySelectorAll('[data-permissions-admin]').forEach((btn) =>
    btn.addEventListener('click', () => openPermissionsModal(admins.find((a) => a.id == btn.dataset.permissionsAdmin)))
  );

  wrap.querySelectorAll('[data-undo-actions]').forEach((btn) =>
    btn.addEventListener('click', () => openUndoActionsModal(btn.dataset.undoActions, btn.dataset.username))
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

async function openUndoActionsModal(adminId, username) {
  let entries;
  try {
    entries = await api(`/api/admin-users/${adminId}/activity`);
  } catch (err) {
    alert(`Could not load activity: ${err.message}`);
    return;
  }

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3>Undo actions · ${escapeHtml(username)}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        ${entries.length === 0 ? `
          <div class="empty-state">No recent actions to undo for this admin.</div>
        ` : `
          <p style="color:var(--muted); font-size:0.85rem; margin-bottom:0.75rem;">
            Select one or more actions below, then undo them together. Each is reversed
            independently — if one fails (e.g. the row was already deleted some other way), the
            rest still go through.
          </p>
          <div style="margin-bottom:0.75rem;">
            <label style="display:flex; align-items:center; gap:0.4rem; font-weight:600;">
              <input type="checkbox" id="select-all-actions" style="width:auto;" /> Select all
            </label>
          </div>
          <div id="undo-actions-list" style="max-height:360px; overflow-y:auto;">
            ${entries.map((e) => `
              <label class="card" style="display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer; padding:0.85rem 1rem;">
                <input type="checkbox" class="undo-action-checkbox" value="${e.id}" style="width:auto; margin-top:0.2rem;" />
                <span>
                  <span class="pill ${e.action === 'delete' ? 'pill-declined' : e.action === 'create' ? 'pill-approved' : 'pill-new'}">${e.action}</span>
                  <span style="margin-left:0.5rem;">${escapeHtml(e.summary)}</span>
                  <div class="mono" style="color:var(--muted); font-size:0.78rem; margin-top:0.2rem;">${escapeHtml(e.createdAt)}</div>
                </span>
              </label>
            `).join('')}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.25rem;">
            <span class="mono" id="selected-count" style="color:var(--muted); font-size:0.82rem;">0 selected</span>
            <button class="btn-primary" id="undo-selected-btn" disabled>Undo selected</button>
          </div>
        `}
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  if (entries.length === 0) return;

  const checkboxes = () => Array.from(document.querySelectorAll('.undo-action-checkbox'));
  const updateCount = () => {
    const count = checkboxes().filter((c) => c.checked).length;
    document.getElementById('selected-count').textContent = `${count} selected`;
    document.getElementById('undo-selected-btn').disabled = count === 0;
  };

  document.getElementById('select-all-actions').addEventListener('change', (e) => {
    checkboxes().forEach((c) => { c.checked = e.target.checked; });
    updateCount();
  });
  checkboxes().forEach((c) => c.addEventListener('change', updateCount));

  document.getElementById('undo-selected-btn').addEventListener('click', async () => {
    const selectedIds = checkboxes().filter((c) => c.checked).map((c) => Number(c.value));
    if (selectedIds.length === 0) return;
    if (!confirm(`Undo ${selectedIds.length} action(s) by ${username}?`)) return;

    try {
      const result = await api(`/api/admin-users/${adminId}/activity/undo`, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      const succeeded = result.results.filter((r) => r.ok).length;
      const failed = result.results.filter((r) => !r.ok);
      toast(`Undid ${succeeded} of ${selectedIds.length} action(s).`);
      if (failed.length > 0) {
        alert(`${failed.length} action(s) couldn't be undone:\n` + failed.map((f) => `#${f.id}: ${f.error}`).join('\n'));
      }
      closeModal();
    } catch (err) {
      alert(`Undo failed: ${err.message}`);
    }
  });
}

function openPermissionsModal(admin) {
  if (!admin) return;
  const perms = admin.tab_permissions || {};

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Permissions — ${escapeHtml(admin.username)}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <p style="color:var(--muted); font-size:0.85rem; margin-top:0;">
          Unchecked "View" hides that tab from their sidebar entirely. "View" without "Edit" lets
          them look but not add, change, or delete anything there.
        </p>
        <div style="max-height:50vh; overflow-y:auto;">
          <table>
            <thead><tr><th>Tab</th><th style="text-align:center;">View</th><th style="text-align:center;">Edit</th></tr></thead>
            <tbody>
              ${PERMISSION_TABS.map((tab) => {
                const entry = perms[tab] || { view: true, edit: true };
                return `
                  <tr>
                    <td>${escapeHtml(TAB_TITLES[tab] || tab)}</td>
                    <td style="text-align:center;"><input type="checkbox" data-perm-view="${tab}" style="width:auto;" ${entry.view !== false ? 'checked' : ''} /></td>
                    <td style="text-align:center;"><input type="checkbox" data-perm-edit="${tab}" style="width:auto;" ${entry.edit !== false ? 'checked' : ''} /></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="error-text" id="permissions-error"></div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          <button class="btn-secondary" id="permissions-reset-btn">Reset to full access</button>
          <button class="btn-primary" id="permissions-save-btn">Save permissions</button>
        </div>
      </div>
    </div>
  `;

  // Edit implies view — flipping Edit on should turn View back on too, and
  // turning View off should turn Edit off, so the checkboxes can't drift
  // into a state the server would reject.
  document.querySelectorAll('[data-perm-edit]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        document.querySelector(`[data-perm-view="${cb.dataset.permEdit}"]`).checked = true;
      }
    });
  });
  document.querySelectorAll('[data-perm-view]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        document.querySelector(`[data-perm-edit="${cb.dataset.permView}"]`).checked = false;
      }
    });
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('permissions-reset-btn').addEventListener('click', async () => {
    try {
      await api(`/api/admin-users/${admin.id}/permissions`, { method: 'PATCH', body: JSON.stringify({ tab_permissions: null }) });
      toast(`${admin.username} now has full access to every tab.`);
      closeModal();
      loadAdmins();
    } catch (err) {
      document.getElementById('permissions-error').textContent = err.message;
    }
  });

  document.getElementById('permissions-save-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('permissions-error');
    errorEl.textContent = '';

    const tab_permissions = {};
    PERMISSION_TABS.forEach((tab) => {
      const view = document.querySelector(`[data-perm-view="${tab}"]`).checked;
      const edit = document.querySelector(`[data-perm-edit="${tab}"]`).checked;
      tab_permissions[tab] = { view, edit: view && edit };
    });

    try {
      await api(`/api/admin-users/${admin.id}/permissions`, { method: 'PATCH', body: JSON.stringify({ tab_permissions }) });
      toast(`Permissions saved for ${admin.username}.`);
      closeModal();
      loadAdmins();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function openEditAdminModal(id, currentUsername, currentEmail) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit admin</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <label>Username</label>
        <input id="edit-admin-username" value="${escapeHtml(currentUsername)}" />
        <label>Email</label>
        <input id="edit-admin-email" type="email" value="${escapeHtml(currentEmail || '')}" placeholder="Needed for \"forgot password\" to work" />
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
    const email = document.getElementById('edit-admin-email').value.trim();
    const password = document.getElementById('edit-admin-password').value;
    const errorEl = document.getElementById('edit-admin-error');
    errorEl.textContent = '';

    if (!username) {
      errorEl.textContent = 'Username cannot be empty.';
      return;
    }

    const payload = { username, email };
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
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <label>Username</label>
        <input id="new-admin-username" />
        <label>Email</label>
        <input id="new-admin-email" type="email" placeholder="Needed for \"forgot password\" to work" />
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
    const email = document.getElementById('new-admin-email').value.trim();
    const password = document.getElementById('new-admin-password').value;
    const errorEl = document.getElementById('new-admin-error');
    errorEl.textContent = '';

    try {
      await api('/api/admin-users', { method: 'POST', body: JSON.stringify({ username, email, password }) });
      toast('Admin added.');
      closeModal();
      loadAdmins();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ---------- fosters ----------

async function loadFosters() {
  const view = document.getElementById('fosters-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;"><button class="btn-primary" id="new-foster-btn">+ Start a foster placement</button></div>
    <div id="fosters-table-wrap">Loading…</div>
  `;
  document.getElementById('new-foster-btn').addEventListener('click', () => openFosterModal());

  try {
    const [fosters, birds] = await Promise.all([api('/api/fosters'), api('/api/birds?all=1')]);
    renderFostersTable(fosters, birds);
  } catch (e) {
    document.getElementById('fosters-table-wrap').innerHTML = `<div class="empty-state">Could not load fosters.</div>`;
  }
}

function renderFostersTable(fosters, birds) {
  const wrap = document.getElementById('fosters-table-wrap');
  if (fosters.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No foster placements yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Bird</th><th>Foster</th><th>Contact</th><th>Started</th><th>Ended</th><th></th></tr></thead>
      <tbody>
        ${fosters.map((f) => `
          <tr>
            <td>${escapeHtml(f.bird_name)}</td>
            <td>${escapeHtml(f.foster_name)}</td>
            <td>${escapeHtml(f.foster_contact || '—')}</td>
            <td class="mono">${escapeHtml(f.start_date)}</td>
            <td>${f.end_date ? `<span class="pill pill-archived">${escapeHtml(f.end_date)}</span>` : `<span class="pill pill-approved">Active</span>`}</td>
            <td><button class="btn-secondary" data-edit-foster="${f.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-edit-foster]').forEach((btn) =>
    btn.addEventListener('click', () => openFosterModal(fosters.find((f) => f.id == btn.dataset.editFoster), birds))
  );
}

function openFosterModal(foster, birds) {
  const isEdit = Boolean(foster);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit foster placement' : 'New foster placement'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="field-grid">
          ${isEdit ? '' : `
          <div><label>Bird</label>
            <select id="f-bird">
              ${(birds || []).map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
            </select>
          </div>`}
          <div class="half"><label>Foster name</label><input id="f-name" value="${escapeHtml(foster?.foster_name || '')}" /></div>
          <div class="half"><label>Contact (optional)</label><input id="f-contact" value="${escapeHtml(foster?.foster_contact || '')}" placeholder="phone or email" /></div>
          <div class="half"><label>Start date</label><input id="f-start" type="date" value="${foster?.start_date || new Date().toISOString().slice(0, 10)}" /></div>
          <div class="half"><label>End date (leave blank if ongoing)</label><input id="f-end" type="date" value="${foster?.end_date || ''}" /></div>
          <div><label>Notes</label><textarea id="f-notes" rows="3">${escapeHtml(foster?.notes || '')}</textarea></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-foster">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-foster">${isEdit ? 'Save changes' : 'Start placement'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.getElementById('save-foster').addEventListener('click', async () => {
    const payload = {
      foster_name: document.getElementById('f-name').value.trim(),
      foster_contact: document.getElementById('f-contact').value.trim(),
      start_date: document.getElementById('f-start').value,
      end_date: document.getElementById('f-end').value || null,
      notes: document.getElementById('f-notes').value.trim(),
    };
    if (!isEdit) payload.bird_id = document.getElementById('f-bird').value;

    if (!payload.foster_name || !payload.start_date) {
      alert('Foster name and start date are required.');
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/fosters/${foster.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Foster placement updated.');
      } else {
        await api('/api/fosters', { method: 'POST', body: JSON.stringify(payload) });
        toast('Foster placement started.');
      }
      closeModal();
      loadFosters();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  });

  if (isEdit) {
    document.getElementById('delete-foster').addEventListener('click', async () => {
      if (!confirm('Delete this foster record permanently?')) return;
      try {
        await api(`/api/fosters/${foster.id}`, { method: 'DELETE' });
        toast('Foster record deleted.');
        closeModal();
        loadFosters();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

// ---------- wishlist ----------

async function loadWishlist() {
  const view = document.getElementById('wishlist-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;"><button class="btn-primary" id="new-wishlist-btn">+ Add item</button></div>
    <div id="wishlist-table-wrap">Loading…</div>
  `;
  document.getElementById('new-wishlist-btn').addEventListener('click', () => openWishlistModal());

  try {
    const items = await api('/api/wishlist?all=1');
    renderWishlistTable(items);
  } catch (e) {
    document.getElementById('wishlist-table-wrap').innerHTML = `<div class="empty-state">Could not load wishlist.</div>`;
  }
}

function renderWishlistTable(items) {
  const wrap = document.getElementById('wishlist-table-wrap');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">Nothing on the wishlist yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Item</th><th>Needed</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.map((i) => `
          <tr>
            <td>${escapeHtml(i.item_name)}</td>
            <td>${escapeHtml(i.quantity_needed || '—')}</td>
            <td><span class="pill ${i.is_fulfilled ? 'pill-archived' : 'pill-new'}">${i.is_fulfilled ? 'Fulfilled' : 'Needed'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn-secondary" data-toggle-fulfilled="${i.id}" data-fulfilled="${i.is_fulfilled}" style="margin-right:0.4rem;">${i.is_fulfilled ? 'Mark needed' : 'Mark fulfilled'}</button>
              <button class="btn-secondary" data-edit-wishlist="${i.id}" style="margin-right:0.4rem;">Edit</button>
              <button class="btn-danger" data-delete-wishlist="${i.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit-wishlist]').forEach((btn) =>
    btn.addEventListener('click', () => openWishlistModal(items.find((i) => i.id == btn.dataset.editWishlist)))
  );
  wrap.querySelectorAll('[data-toggle-fulfilled]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/wishlist/${btn.dataset.toggleFulfilled}`, { method: 'PATCH', body: JSON.stringify({ is_fulfilled: btn.dataset.fulfilled !== 'true' }) });
        loadWishlist();
      } catch (err) {
        alert(`Could not update: ${err.message}`);
      }
    })
  );
  wrap.querySelectorAll('[data-delete-wishlist]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this wishlist item permanently?')) return;
      try {
        await api(`/api/wishlist/${btn.dataset.deleteWishlist}`, { method: 'DELETE' });
        toast('Item deleted.');
        loadWishlist();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

function openWishlistModal(item) {
  const isEdit = Boolean(item);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit item' : 'New wishlist item'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <label>Item name</label>
        <input id="w-name" value="${escapeHtml(item?.item_name || '')}" placeholder="e.g. Millet sprays" />
        <label>Quantity needed (optional)</label>
        <input id="w-qty" value="${escapeHtml(item?.quantity_needed || '')}" placeholder="e.g. 10 boxes" />
        <label>Description (optional)</label>
        <textarea id="w-desc" rows="3">${escapeHtml(item?.description || '')}</textarea>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-wishlist">${isEdit ? 'Save changes' : 'Add item'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.getElementById('save-wishlist').addEventListener('click', async () => {
    const payload = {
      item_name: document.getElementById('w-name').value.trim(),
      quantity_needed: document.getElementById('w-qty').value.trim(),
      description: document.getElementById('w-desc').value.trim(),
    };
    if (!payload.item_name) { alert('Item name is required.'); return; }

    try {
      if (isEdit) {
        await api(`/api/wishlist/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Item updated.');
      } else {
        await api('/api/wishlist', { method: 'POST', body: JSON.stringify(payload) });
        toast('Item added.');
      }
      closeModal();
      loadWishlist();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  });
}

// ---------- testimonials ----------

async function loadTestimonials() {
  const view = document.getElementById('testimonials-view');
  view.innerHTML = `<div id="testimonials-table-wrap">Loading…</div>`;
  try {
    const items = await api('/api/testimonials?all=1');
    renderTestimonialsTable(items);
  } catch (e) {
    document.getElementById('testimonials-table-wrap').innerHTML = `<div class="empty-state">Could not load testimonials.</div>`;
  }
}

function renderTestimonialsTable(items) {
  const wrap = document.getElementById('testimonials-table-wrap');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No submitted stories yet.</div>`;
    return;
  }
  wrap.innerHTML = items.map((t) => `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
        <div>
          <strong>${escapeHtml(t.author_name)}</strong>${t.bird_name ? ` · adopted ${escapeHtml(t.bird_name)}` : ''}
          <div class="mono" style="color:var(--muted); font-size:0.78rem;">${fmtDate(t.created_at)}</div>
        </div>
        <span class="pill ${t.is_approved ? 'pill-approved' : 'pill-new'}">${t.is_approved ? 'Published' : 'Pending review'}</span>
      </div>
      <p style="margin-bottom:0.75rem;">${escapeHtml(t.story)}</p>
      <div style="display:flex; gap:0.5rem;">
        <button class="btn-secondary" data-toggle-approve="${t.id}" data-approved="${t.is_approved}">${t.is_approved ? 'Unpublish' : 'Approve & publish'}</button>
        <button class="btn-danger" data-delete-testimonial="${t.id}">Delete</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-toggle-approve]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/testimonials/${btn.dataset.toggleApprove}`, { method: 'PATCH', body: JSON.stringify({ is_approved: btn.dataset.approved !== 'true' }) });
        loadTestimonials();
      } catch (err) {
        alert(`Could not update: ${err.message}`);
      }
    })
  );
  wrap.querySelectorAll('[data-delete-testimonial]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this story permanently?')) return;
      try {
        await api(`/api/testimonials/${btn.dataset.deleteTestimonial}`, { method: 'DELETE' });
        toast('Story deleted.');
        loadTestimonials();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    })
  );
}

// ---------- FAQs ----------

async function loadFaqs() {
  const view = document.getElementById('faqs-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;"><button class="btn-primary" id="new-faq-btn">+ Add FAQ</button></div>
    <div id="faqs-table-wrap">Loading…</div>
  `;
  document.getElementById('new-faq-btn').addEventListener('click', () => openFaqModal());
  try {
    const items = await api('/api/faqs?all=1');
    renderFaqsTable(items);
  } catch (e) {
    document.getElementById('faqs-table-wrap').innerHTML = `<div class="empty-state">Could not load FAQs.</div>`;
  }
}

function renderFaqsTable(items) {
  const wrap = document.getElementById('faqs-table-wrap');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No FAQs yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Order</th><th>Question</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.map((f) => `
          <tr>
            <td class="mono">${f.sort_order}</td>
            <td>${escapeHtml(f.question)}</td>
            <td><span class="pill ${f.is_published ? 'pill-approved' : 'pill-archived'}">${f.is_published ? 'Published' : 'Draft'}</span></td>
            <td><button class="btn-secondary" data-edit-faq="${f.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-edit-faq]').forEach((btn) =>
    btn.addEventListener('click', () => openFaqModal(items.find((f) => f.id == btn.dataset.editFaq)))
  );
}

function openFaqModal(faq) {
  const isEdit = Boolean(faq);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit FAQ' : 'New FAQ'}</h3>
          <button class="btn-ghost" id="modal-close" aria-label="Close">✕</button>
        </div>
        <label>Question</label>
        <input id="faq-question" value="${escapeHtml(faq?.question || '')}" />
        <label>Answer</label>
        <textarea id="faq-answer" rows="4">${escapeHtml(faq?.answer || '')}</textarea>
        <div class="field-grid">
          <div class="half"><label>Sort order (lower shows first)</label><input id="faq-order" type="number" value="${faq?.sort_order ?? 0}" /></div>
          <div class="half"><label>Status</label>
            <select id="faq-published">
              <option value="1" ${faq?.is_published !== 0 ? 'selected' : ''}>Published</option>
              <option value="0" ${faq?.is_published === 0 ? 'selected' : ''}>Draft</option>
            </select>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-faq">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-faq">${isEdit ? 'Save changes' : 'Add FAQ'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.getElementById('save-faq').addEventListener('click', async () => {
    const payload = {
      question: document.getElementById('faq-question').value.trim(),
      answer: document.getElementById('faq-answer').value.trim(),
      sort_order: Number(document.getElementById('faq-order').value) || 0,
      is_published: document.getElementById('faq-published').value === '1',
    };
    if (!payload.question || !payload.answer) { alert('Question and answer are required.'); return; }

    try {
      if (isEdit) {
        await api(`/api/faqs/${faq.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('FAQ updated.');
      } else {
        await api('/api/faqs', { method: 'POST', body: JSON.stringify(payload) });
        toast('FAQ added.');
      }
      closeModal();
      loadFaqs();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  });

  if (isEdit) {
    document.getElementById('delete-faq').addEventListener('click', async () => {
      if (!confirm('Delete this FAQ permanently?')) return;
      try {
        await api(`/api/faqs/${faq.id}`, { method: 'DELETE' });
        toast('FAQ deleted.');
        closeModal();
        loadFaqs();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

// ---------- store ----------

function fmtMoney(n) {
  return `$${Number(n).toFixed(2)}`;
}

async function loadStore() {
  const view = document.getElementById('store-view');
  view.innerHTML = `
    <div style="margin-bottom:1rem;"><button class="btn-primary" id="new-store-item-btn">+ Add item</button></div>
    <div id="store-table-wrap">Loading…</div>
  `;
  document.getElementById('new-store-item-btn').addEventListener('click', () => openStoreItemModal());

  try {
    const items = await api('/api/store?all=1');
    renderStoreTable(items);
  } catch (e) {
    document.getElementById('store-table-wrap').innerHTML = `<div class="empty-state">Could not load store items.</div>`;
  }
}

function renderStoreTable(items) {
  const wrap = document.getElementById('store-table-wrap');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No store items yet. Add your first one above.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th></th><th>Name</th><th>Price</th><th>Status</th><th>Visible</th><th></th></tr></thead>
      <tbody>
        ${items.map((i) => `
          <tr>
            <td>${i.image_url
              ? `<img src="${escapeHtml(i.image_url)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;" />`
              : `<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.06);"></div>`}</td>
            <td>${escapeHtml(i.name)}</td>
            <td class="mono">
              ${i.is_on_sale
                ? `<span style="text-decoration:line-through; color:var(--muted);">${fmtMoney(i.price)}</span> <strong style="color:var(--danger);">${fmtMoney(i.sale_price)}</strong>`
                : fmtMoney(i.price)}
            </td>
            <td>
              ${i.is_clearance ? '<span class="pill pill-declined">Clearance</span> ' : ''}
              ${i.is_on_sale ? '<span class="pill pill-new">On sale</span> ' : ''}
              ${i.is_sold_out ? '<span class="pill pill-archived">Sold out</span>' : ''}
              ${!i.is_clearance && !i.is_on_sale && !i.is_sold_out ? '<span class="pill pill-approved">Regular</span>' : ''}
            </td>
            <td><span class="pill ${i.is_published ? 'pill-approved' : 'pill-archived'}">${i.is_published ? 'Published' : 'Draft'}</span></td>
            <td><button class="btn-secondary" data-edit-item="${i.id}">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-edit-item]').forEach((btn) =>
    btn.addEventListener('click', () => openStoreItemModal(items.find((i) => i.id == btn.dataset.editItem)))
  );
}

function openStoreItemModal(item) {
  const isEdit = Boolean(item);
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit item' : 'New store item'}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="field-grid">
          <div><label>Name</label><input id="si-name" value="${escapeHtml(item?.name || '')}" /></div>
          <div><label>Description</label><textarea id="si-desc" rows="3">${escapeHtml(item?.description || '')}</textarea></div>
          <div>${imageFieldHtml('si-image', item?.image_url, 'Photo (optional)')}</div>
          <div><label>Buy link (optional)</label><input id="si-buy-url" value="${escapeHtml(item?.buy_url || '')}" placeholder="Your PayPal/Stripe/Etsy checkout link for this item" /></div>
          <div class="half"><label>Regular price ($)</label><input id="si-price" type="number" step="0.01" min="0" value="${item?.price ?? ''}" /></div>
          <div class="half"><label>Sale price ($, if on sale)</label><input id="si-sale-price" type="number" step="0.01" min="0" value="${item?.sale_price ?? ''}" /></div>
          <div class="half"><label style="display:flex; align-items:center; gap:0.4rem; margin-top:1.2rem;"><input type="checkbox" id="si-on-sale" ${item?.is_on_sale ? 'checked' : ''} style="width:auto;" /> On sale</label></div>
          <div class="half"><label style="display:flex; align-items:center; gap:0.4rem; margin-top:1.2rem;"><input type="checkbox" id="si-clearance" ${item?.is_clearance ? 'checked' : ''} style="width:auto;" /> Clearance</label></div>
          <div class="half"><label style="display:flex; align-items:center; gap:0.4rem;"><input type="checkbox" id="si-sold-out" ${item?.is_sold_out ? 'checked' : ''} style="width:auto;" /> Sold out</label></div>
          <div class="half"><label>Visibility</label>
            <select id="si-published">
              <option value="1" ${item?.is_published !== 0 ? 'selected' : ''}>Published</option>
              <option value="0" ${item?.is_published === 0 ? 'selected' : ''}>Draft</option>
            </select>
          </div>
        </div>
        <div class="error-text" id="store-item-error"></div>
        <div style="display:flex; justify-content:space-between; margin-top:1.25rem;">
          ${isEdit ? `<button class="btn-danger" id="delete-store-item">Delete</button>` : `<span></span>`}
          <button class="btn-primary" id="save-store-item">${isEdit ? 'Save changes' : 'Add item'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  attachImageUploadHandlers('si-image');

  document.getElementById('save-store-item').addEventListener('click', async () => {
    const errorEl = document.getElementById('store-item-error');
    errorEl.textContent = '';

    const payload = {
      name: document.getElementById('si-name').value.trim(),
      description: document.getElementById('si-desc').value.trim(),
      image_url: document.getElementById('si-image').value.trim(),
      buy_url: document.getElementById('si-buy-url').value.trim(),
      price: document.getElementById('si-price').value,
      sale_price: document.getElementById('si-sale-price').value,
      is_on_sale: document.getElementById('si-on-sale').checked,
      is_clearance: document.getElementById('si-clearance').checked,
      is_sold_out: document.getElementById('si-sold-out').checked,
      is_published: document.getElementById('si-published').value === '1',
    };

    if (!payload.name || payload.price === '') {
      errorEl.textContent = 'Name and regular price are required.';
      return;
    }
    if (payload.is_on_sale && payload.sale_price === '') {
      errorEl.textContent = 'Enter a sale price, or uncheck "On sale."';
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/store/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Item updated.');
      } else {
        await api('/api/store', { method: 'POST', body: JSON.stringify(payload) });
        toast('Item added.');
      }
      closeModal();
      loadStore();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  if (isEdit) {
    document.getElementById('delete-store-item').addEventListener('click', async () => {
      if (!confirm(`Delete "${item.name}" permanently?`)) return;
      try {
        await api(`/api/store/${item.id}`, { method: 'DELETE' });
        toast('Item deleted.');
        closeModal();
        loadStore();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    });
  }
}

boot();
