const API_BASE = window.location.origin;
let currentTab = 'overview';
let tablesCache = [];

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
  if (res.status === 403) {
    document.body.innerHTML = '<div style="padding:3rem; font-family:sans-serif;">This area is restricted to the site owner. <a href="/admin/index.html">Back to the regular admin panel</a>.</div>';
    throw new Error('Forbidden');
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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ---------- boot ----------

async function boot() {
  try {
    const me = await api('/api/auth/me');
    // api() above already redirects to login on 401 and blocks the page on
    // 403, so reaching here means this account really is the super admin.
    document.getElementById('signed-in-as').textContent = `Signed in as ${me.username}`;
  } catch (e) {
    return;
  }

  document.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = './login.html';
  });

  switchTab('overview');
}

const TAB_TITLES = {
  overview: 'Tables overview',
  undo: 'Undo log',
  query: 'Read-only query',
  monitor: 'Server monitor',
  backup: 'Backup',
};

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('view-title').textContent = TAB_TITLES[tab];

  if (tab === 'overview') loadOverview();
  else if (tab === 'undo') loadUndoLog();
  else if (tab === 'query') loadQueryTool();
  else if (tab === 'monitor') loadMonitor();
  else if (tab === 'backup') loadBackup();
}

// ---------- overview ----------

async function loadOverview() {
  const view = document.getElementById('content-view');
  view.innerHTML = `<div id="tables-wrap">Loading…</div>`;

  try {
    const tables = await api('/api/db-admin/tables');
    tablesCache = tables;
    renderTablesOverview(tables);
  } catch (e) {
    document.getElementById('tables-wrap').innerHTML = `<div class="empty-state">Could not load tables.</div>`;
  }
}

function renderTablesOverview(tables) {
  const wrap = document.getElementById('tables-wrap');
  wrap.innerHTML = tables.map((t) => `
    <div class="sa-table-row">
      <div>
        <strong class="mono">${escapeHtml(t.table)}</strong>
        <span style="color:var(--muted); margin-left:0.75rem;">${t.rowCount} row${t.rowCount === 1 ? '' : 's'}</span>
        ${t.protectedFromFlush ? '<span class="pill pill-archived" style="margin-left:0.5rem;">Protected</span>' : ''}
      </div>
      <div>
        <button class="btn-secondary" data-browse="${t.table}" style="margin-right:0.4rem;">Browse</button>
        ${t.protectedFromFlush ? '' : `<button class="btn-danger" data-flush="${t.table}">Flush</button>`}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-browse]').forEach((btn) =>
    btn.addEventListener('click', () => openBrowseModal(btn.dataset.browse))
  );
  wrap.querySelectorAll('[data-flush]').forEach((btn) =>
    btn.addEventListener('click', () => openFlushModal(btn.dataset.flush))
  );
}

async function openBrowseModal(table, offset = 0) {
  const data = await api(`/api/db-admin/tables/${table}/rows?limit=25&offset=${offset}`);

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:900px;">
        <div class="modal-header">
          <h3 class="mono">${escapeHtml(table)}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <p style="color:var(--muted); font-size:0.85rem; margin-bottom:1rem;">
          Showing ${data.rows.length} of ${data.total} rows. Sensitive columns are masked and can't be edited here.
        </p>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr>${data.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th></th></tr></thead>
            <tbody>
              ${data.rows.map((row) => `
                <tr>
                  ${data.columns.map((c) => `<td class="mono" style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(row[c])}</td>`).join('')}
                  <td><button class="btn-secondary" data-edit-row="${row.id}" style="font-size:0.78rem; padding:0.3rem 0.6rem;">Edit</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:1rem;">
          <button class="btn-secondary" id="prev-page" ${offset === 0 ? 'disabled' : ''}>← Previous</button>
          <button class="btn-secondary" id="next-page" ${offset + data.rows.length >= data.total ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  document.getElementById('prev-page').addEventListener('click', () => openBrowseModal(table, Math.max(0, offset - 25)));
  document.getElementById('next-page').addEventListener('click', () => openBrowseModal(table, offset + 25));

  document.querySelectorAll('[data-edit-row]').forEach((btn) => {
    const row = data.rows.find((r) => String(r.id) === btn.dataset.editRow);
    btn.addEventListener('click', () => openEditRowModal(table, row, data.columns, data.sensitiveColumns, offset));
  });
}

function openEditRowModal(table, row, columns, sensitiveColumns, returnOffset) {
  const editableColumns = columns.filter((c) => c !== 'id' && !sensitiveColumns.includes(c));

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3 class="mono">${escapeHtml(table)} #${row.id}</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        ${editableColumns.map((c) => `
          <label class="mono">${escapeHtml(c)}</label>
          <textarea data-field="${c}" rows="2">${escapeHtml(row[c])}</textarea>
        `).join('')}
        <div class="error-text" id="edit-row-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-primary" id="save-row">Save changes</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.getElementById('save-row').addEventListener('click', async () => {
    const errorEl = document.getElementById('edit-row-error');
    errorEl.textContent = '';

    const payload = {};
    document.querySelectorAll('[data-field]').forEach((el) => { payload[el.dataset.field] = el.value; });

    try {
      await api(`/api/db-admin/tables/${table}/rows/${row.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('Row updated. (Undoable from the Undo log tab.)');
      closeModal();
      openBrowseModal(table, returnOffset);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function openFlushModal(table) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>Flush "${escapeHtml(table)}"</h3>
          <button class="btn-ghost" id="modal-close">✕</button>
        </div>
        <p style="color:var(--danger); font-weight:600; margin-bottom:1rem;">
          This deletes every row in "${escapeHtml(table)}." It can be undone from the Undo log tab
          for the next 72 hours — after that, only a backup can bring it back. Download a backup
          first if you're not sure.
        </p>
        <label>Type "${escapeHtml(table)}" to confirm</label>
        <input id="flush-confirm-input" autocomplete="off" />
        <div class="error-text" id="flush-error"></div>
        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <button class="btn-danger" id="confirm-flush-btn">Flush table</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.getElementById('confirm-flush-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('flush-error');
    const typed = document.getElementById('flush-confirm-input').value;
    if (typed !== table) {
      errorEl.textContent = 'That doesn\'t match — type the table name exactly.';
      return;
    }
    try {
      const result = await api(`/api/db-admin/tables/${table}/flush`, { method: 'DELETE', body: JSON.stringify({ confirm: typed }) });
      toast(`Deleted ${result.deleted} row(s) from ${table}. (Undoable from the Undo log tab.)`);
      closeModal();
      loadOverview();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ---------- read-only query ----------

function loadQueryTool() {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <p style="color:var(--muted); font-size:0.85rem; margin-bottom:0.75rem;">
      SELECT statements only — this is for looking things up, not making changes. Use the table
      browser for edits.
    </p>
    <textarea id="query-input" rows="4" placeholder="SELECT * FROM birds WHERE status = 'available'" style="font-family:'JetBrains Mono', monospace; font-size:0.85rem;"></textarea>
    <button class="btn-primary" id="run-query-btn" style="margin-top:0.75rem;">Run query</button>
    <div class="error-text" id="query-error"></div>
    <div id="query-results" style="margin-top:1.5rem;"></div>
  `;

  document.getElementById('run-query-btn').addEventListener('click', async () => {
    const sql = document.getElementById('query-input').value.trim();
    const errorEl = document.getElementById('query-error');
    const resultsEl = document.getElementById('query-results');
    errorEl.textContent = '';
    resultsEl.innerHTML = '';

    if (!sql) return;

    try {
      const result = await api('/api/db-admin/query', { method: 'POST', body: JSON.stringify({ sql }) });
      if (result.rows.length === 0) {
        resultsEl.innerHTML = `<div class="empty-state">Query ran fine, no rows returned.</div>`;
        return;
      }
      const columns = Object.keys(result.rows[0]);
      resultsEl.innerHTML = `
        <p style="color:var(--muted); font-size:0.85rem; margin-bottom:0.5rem;">${result.count} row(s)</p>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${result.rows.map((row) => `<tr>${columns.map((c) => `<td class="mono">${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ---------- monitor ----------

async function loadMonitor() {
  const view = document.getElementById('content-view');
  view.innerHTML = `<div id="monitor-wrap">Loading…</div>`;

  try {
    const stats = await api('/api/db-admin/monitor');
    document.getElementById('monitor-wrap').innerHTML = `
      <div class="sa-stat-grid" style="margin-bottom:2rem;">
        <div class="card"><div style="font-size:1.4rem; font-weight:700; font-family:'Fraunces',serif;">${fmtDuration(stats.uptimeSeconds)}</div><div class="mono" style="color:var(--muted); font-size:0.8rem;">Server uptime</div></div>
        <div class="card"><div style="font-size:1.4rem; font-weight:700; font-family:'Fraunces',serif;">${fmtBytes(stats.databaseSizeBytes)}</div><div class="mono" style="color:var(--muted); font-size:0.8rem;">Database file size</div></div>
        <div class="card"><div style="font-size:1.4rem; font-weight:700; font-family:'Fraunces',serif;">${fmtBytes(stats.memory.rss)}</div><div class="mono" style="color:var(--muted); font-size:0.8rem;">Memory in use</div></div>
        <div class="card"><div style="font-size:1.4rem; font-weight:700; font-family:'Fraunces',serif;">${escapeHtml(stats.nodeVersion)}</div><div class="mono" style="color:var(--muted); font-size:0.8rem;">Node.js version</div></div>
      </div>
      <p class="mono" style="color:var(--muted); font-size:0.8rem; margin-bottom:1.5rem;">Database path: ${escapeHtml(stats.databasePath)} · Server time: ${escapeHtml(stats.serverTime)}</p>
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">Restart server</h3>
        <p style="color:var(--muted); font-size:0.85rem; margin-bottom:1rem;">
          Forces a clean restart — useful if something seems stuck or cached. The server will be
          briefly unreachable (a few seconds) while it comes back up.
        </p>
        <button class="btn-danger" id="restart-btn">Restart now</button>
      </div>
    `;

    document.getElementById('restart-btn').addEventListener('click', async () => {
      if (!confirm('Restart the server now? It will be briefly unreachable.')) return;
      try {
        await api('/api/db-admin/restart', { method: 'POST' });
        toast('Restarting…');
      } catch (err) {
        // A failed fetch here is actually expected once the process exits mid-response
        toast('Restart triggered — reconnecting in a few seconds.');
      }
    });
  } catch (e) {
    document.getElementById('monitor-wrap').innerHTML = `<div class="empty-state">Could not load server stats.</div>`;
  }
}

// ---------- backup ----------

function loadBackup() {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:0.5rem;">Download a full backup</h3>
      <p style="color:var(--muted); font-size:0.9rem; margin-bottom:1rem;">
        Downloads a complete, consistent snapshot of the database as it exists right now — safe to
        run any time, doesn't lock or interrupt the live site. Store it somewhere safe (not just
        your Downloads folder).
      </p>
      <a class="btn-primary" href="${API_BASE}/api/db-admin/backup" style="display:inline-block; text-decoration:none;">Download backup (.db file)</a>
    </div>
  `;
}

// ---------- undo log ----------

async function loadUndoLog() {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <p style="color:var(--muted); font-size:0.85rem; margin-bottom:1rem;">
      Every flush and row edit made through this panel is logged here automatically for 72 hours,
      so you can reverse a mistake without needing a full backup restore. Nothing outside this
      panel (the regular admin tabs, applications, etc.) is affected by this log.
    </p>
    <div id="undo-log-wrap">Loading…</div>
  `;

  try {
    const entries = await api('/api/db-admin/undo-log');
    renderUndoLog(entries);
  } catch (e) {
    document.getElementById('undo-log-wrap').innerHTML = `<div class="empty-state">Could not load the undo log.</div>`;
  }
}

function renderUndoLog(entries) {
  const wrap = document.getElementById('undo-log-wrap');
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="empty-state">Nothing to undo — no flushes or edits in the last 72 hours.</div>`;
    return;
  }

  wrap.innerHTML = entries.map((e) => `
    <div class="sa-table-row">
      <div>
        <span class="pill ${e.action === 'flush' ? 'pill-declined' : 'pill-new'}">${e.action === 'flush' ? 'Flush' : 'Edit'}</span>
        <span style="margin-left:0.6rem;">${escapeHtml(e.summary)}</span>
        <div class="mono" style="color:var(--muted); font-size:0.78rem; margin-top:0.2rem;">${escapeHtml(e.createdAt)}</div>
      </div>
      <button class="btn-primary" data-undo="${e.id}">Undo this</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-undo]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Reverse this action? This restores the previous data.')) return;
      try {
        await api(`/api/db-admin/undo-log/${btn.dataset.undo}/undo`, { method: 'POST' });
        toast('Undone.');
        loadUndoLog();
      } catch (err) {
        alert(`Could not undo: ${err.message}`);
      }
    })
  );
}

boot();
