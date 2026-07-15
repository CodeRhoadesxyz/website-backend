(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-my-applications';

  if (!window.RescueWidgets) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This widget failed to load — shared.js must be included on this page before my-applications.js.</p>';
    }
    console.error('Rescue widget: shared.js must be loaded before my-applications.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, authFetch } = window.RescueWidgets;

  let currentUser = null;
  let container = null;

  const STATUS_INFO = {
    new: { label: 'Received', desc: "We've got it — not yet reviewed." },
    in_review: { label: 'Being reviewed', desc: "Our team is looking this over." },
    needs_info: { label: 'Action needed', desc: 'We need a bit more from you — see the conversation below.' },
    approved: { label: 'Approved', desc: "Great news — you've been approved! 🎉" },
    declined: { label: 'Not approved', desc: 'This application was not approved at this time.' },
    archived: { label: 'Archived', desc: 'This application has been closed out.' },
  };

  const TYPE_LABELS = { adoption: 'Adoption', relinquishment: 'Relinquishment', volunteer: 'Volunteer' };

  function fmtDate(iso) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getRoute() {
    const match = window.location.hash.match(/^#application-(\d+)/);
    return match ? { view: 'detail', id: match[1] } : { view: 'list' };
  }

  async function boot() {
    container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    try {
      currentUser = await authFetch(apiBase, '/api/users/me');
    } catch (err) {
      currentUser = null;
    }

    render();
    window.addEventListener('hashchange', render);
  }

  function render() {
    if (!currentUser) {
      renderAuthGate();
      return;
    }
    const route = getRoute();
    if (route.view === 'detail') {
      renderDetail(route.id);
    } else {
      renderList();
    }
  }

  // ---------- auth gate ----------

  function renderAuthGate() {
    container.innerHTML = `
      <div class="rescue-widget rw-blog-wrap">
        <p style="margin-bottom:1rem;">Sign in to view your application status and message us about it.</p>
        <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
          <button class="rw-blog-link-btn" id="rw-ma-show-login">Log in</button>
          <button class="rw-blog-link-btn" id="rw-ma-show-signup">Sign up</button>
        </div>
        <div id="rw-ma-auth-form-slot"></div>
        <p style="color:#6b6b6b; font-size:0.85rem; margin-top:1rem;">
          Note: only applications submitted <em>while signed in</em> show up here. If you applied
          before creating an account, please reach out to us directly about that one.
        </p>
      </div>
    `;
    document.getElementById('rw-ma-show-login').addEventListener('click', () => toggleAuthForm('login'));
    document.getElementById('rw-ma-show-signup').addEventListener('click', () => toggleAuthForm('signup'));
  }

  function toggleAuthForm(mode) {
    const slot = document.getElementById('rw-ma-auth-form-slot');
    if (slot.dataset.mode === mode) {
      slot.innerHTML = '';
      slot.removeAttribute('data-mode');
      return;
    }
    slot.dataset.mode = mode;

    if (mode === 'login') {
      slot.innerHTML = `
        <form id="rw-ma-login-form" class="rw-blog-inline-form">
          <label>Username</label>
          <input name="username" required />
          <label>Password</label>
          <input name="password" type="password" required />
          <div class="rw-error" id="rw-ma-login-error"></div>
          <button type="submit">Log in</button>
        </form>
      `;
      const form = document.getElementById('rw-ma-login-form');
      const errorEl = document.getElementById('rw-ma-login-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          currentUser = await authFetch(apiBase, '/api/users/login', {
            method: 'POST',
            body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
          });
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    } else {
      slot.innerHTML = `
        <form id="rw-ma-signup-form" class="rw-blog-inline-form">
          <label>Display name</label>
          <input name="display_name" required />
          <label>Username</label>
          <input name="username" required placeholder="3-30 characters, no spaces" />
          <label>Email</label>
          <input name="email" type="email" required />
          <label>Password</label>
          <input name="password" type="password" required placeholder="At least 8 characters" />
          <div class="rw-error" id="rw-ma-signup-error"></div>
          <button type="submit">Create account</button>
        </form>
      `;
      const form = document.getElementById('rw-ma-signup-form');
      const errorEl = document.getElementById('rw-ma-signup-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          currentUser = await authFetch(apiBase, '/api/users/signup', {
            method: 'POST',
            body: JSON.stringify({
              display_name: form.display_name.value.trim(),
              username: form.username.value.trim(),
              email: form.email.value.trim(),
              password: form.password.value,
            }),
          });
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    }
  }

  // ---------- list ----------

  async function renderList() {
    container.innerHTML = `
      <div class="rescue-widget rw-blog-wrap">
        <div class="rw-blog-authbar">
          <span>Signed in as <strong>${escapeHtml(currentUser.display_name)}</strong></span>
          <button class="rw-blog-link-btn" id="rw-ma-logout-btn">Log out</button>
        </div>
        <div id="rw-ma-list">Loading your applications…</div>
      </div>
    `;
    document.getElementById('rw-ma-logout-btn').addEventListener('click', async () => {
      await authFetch(apiBase, '/api/users/logout', { method: 'POST' });
      currentUser = null;
      render();
    });

    try {
      const apps = await authFetch(apiBase, '/api/applications/mine');
      const listEl = document.getElementById('rw-ma-list');
      if (apps.length === 0) {
        listEl.innerHTML = `<p>No applications on file yet under this account.</p>`;
        return;
      }
      listEl.innerHTML = apps.map((a) => {
        const info = STATUS_INFO[a.status] || { label: a.status, desc: '' };
        return `
          <a href="#application-${a.id}" class="rw-blog-post-card" style="display:block; text-decoration:none; color:inherit;">
            <div class="rw-blog-post-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>${TYPE_LABELS[a.type] || a.type} application</span>
              <span class="rw-ma-status-badge rw-ma-status-${escapeHtml(a.status)}">${info.label}</span>
            </div>
            <div class="rw-blog-post-meta">Submitted ${fmtDate(a.created_at)}</div>
            <p class="rw-blog-post-excerpt">${escapeHtml(info.desc)}</p>
          </a>
        `;
      }).join('');
    } catch (err) {
      document.getElementById('rw-ma-list').innerHTML = `<p class="rw-error">Could not load your applications right now.</p>`;
    }
  }

  // ---------- detail + chat ----------

  async function renderDetail(id) {
    container.innerHTML = `<div class="rescue-widget rw-blog-wrap"><p>Loading…</p></div>`;

    let app;
    try {
      const apps = await authFetch(apiBase, '/api/applications/mine');
      app = apps.find((a) => String(a.id) === String(id));
    } catch (err) {
      app = null;
    }

    if (!app) {
      container.innerHTML = `
        <div class="rescue-widget rw-blog-wrap">
          <a href="#" class="rw-blog-back">← Back to your applications</a>
          <p class="rw-error">That application couldn't be found on your account.</p>
        </div>
      `;
      attachBackLink();
      return;
    }

    const info = STATUS_INFO[app.status] || { label: app.status, desc: '' };

    container.innerHTML = `
      <div class="rescue-widget rw-blog-wrap">
        <a href="#" class="rw-blog-back">← Back to your applications</a>
        <h3 class="rw-blog-post-title-full">${TYPE_LABELS[app.type] || app.type} application</h3>
        <div class="rw-blog-post-meta">Submitted ${fmtDate(app.created_at)}</div>
        <div class="rw-ma-status-block rw-ma-status-${escapeHtml(app.status)}">
          <strong>${info.label}</strong> — ${escapeHtml(info.desc)}
        </div>

        <div class="rw-blog-comments">
          <h4>Conversation</h4>
          <div id="rw-ma-messages">Loading…</div>
          <form id="rw-ma-message-form" class="rw-blog-inline-form">
            <textarea name="body" rows="3" placeholder="Write a message…" required></textarea>
            <div class="rw-error" id="rw-ma-message-error"></div>
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    `;

    attachBackLink();
    loadMessages(id);

    document.getElementById('rw-ma-message-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errorEl = document.getElementById('rw-ma-message-error');
      errorEl.textContent = '';
      try {
        await authFetch(apiBase, `/api/applications/${id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body: form.body.value.trim() }),
        });
        form.body.value = '';
        loadMessages(id);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  function attachBackLink() {
    const backLink = container.querySelector('.rw-blog-back');
    if (backLink) {
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '';
      });
    }
  }

  async function loadMessages(id) {
    const wrap = document.getElementById('rw-ma-messages');
    if (!wrap) return;
    try {
      const messages = await authFetch(apiBase, `/api/applications/${id}/messages`);
      if (messages.length === 0) {
        wrap.innerHTML = `<p style="color:#6b6b6b; font-size:0.9rem;">No messages yet.</p>`;
        return;
      }
      wrap.innerHTML = messages.map((m) => `
        <div class="rw-blog-comment" style="${m.sender_type === 'applicant' ? 'background:rgba(79,115,88,0.06);' : ''}">
          <div class="rw-blog-comment-meta"><strong>${escapeHtml(m.sender_name)}</strong> · ${fmtDate(m.created_at)}</div>
          <div>${escapeHtml(m.body)}</div>
        </div>
      `).join('');
    } catch (err) {
      wrap.innerHTML = `<p class="rw-error">Could not load the conversation.</p>`;
    }
  }

  boot();
})();
