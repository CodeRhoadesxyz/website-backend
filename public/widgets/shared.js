(function () {
  function getApiBase(scriptEl) {
    if (scriptEl && scriptEl.dataset.apiBase) return scriptEl.dataset.apiBase.replace(/\/$/, '');
    if (window.RESCUE_API_BASE) return window.RESCUE_API_BASE.replace(/\/$/, '');
    // Fallback: assume the widget script is served from the same backend it should call.
    const src = scriptEl && scriptEl.src;
    if (src) {
      const url = new URL(src);
      return `${url.protocol}//${url.host}`;
    }
    return '';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  async function postJson(apiBase, path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  async function getJson(apiBase, path) {
    const res = await fetch(`${apiBase}${path}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  // Like postJson/getJson but sends cookies (credentials: 'include') and
  // supports any method — needed for the blog's account system (signup,
  // login, creating posts/comments, deleting your own posts/comments), all
  // of which rely on the user_token cookie for identity.
  async function authFetch(apiBase, path, options = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // --- Maintenance mode banner ---
  // Runs once, automatically, on every page that loads shared.js (which is
  // every page with any widget embedded — forms, birds grid, events,
  // announcements, blog). Independent of any individual widget's own error
  // handling: even if a widget hasn't loaded yet, visitors immediately see
  // why things aren't working, with a live countdown if one was set.
  // Captured immediately (synchronously) here, since document.currentScript
  // is only valid while this script is actively executing — it would be
  // null by the time a deferred DOMContentLoaded callback runs.
  const sharedScriptEl = document.currentScript;

  function initMaintenanceBanner() {
    const apiBase = getApiBase(sharedScriptEl);
    if (!apiBase) return;

    let countdownTimer = null;
    let bannerEl = null;

    function ensureBanner() {
      if (bannerEl) return bannerEl;
      bannerEl = document.createElement('div');
      bannerEl.id = 'rescue-maintenance-banner';
      bannerEl.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'background:#3a2a24', 'color:#f2e9df', 'font-family:system-ui,sans-serif',
        'padding:0.65rem 1rem', 'text-align:center', 'font-size:0.9rem',
        'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
      ].join(';');
      document.body.prepend(bannerEl);
      return bannerEl;
    }

    function removeBanner() {
      if (countdownTimer) clearInterval(countdownTimer);
      if (bannerEl) { bannerEl.remove(); bannerEl = null; }
    }

    function render(status) {
      if (!status.active && !status.scheduled) { removeBanner(); return; }

      const el = ensureBanner();
      const skewMs = Date.now() - new Date(status.server_time).getTime();

      function formatCountdown(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const pad = (n) => String(n).padStart(2, '0');
        if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
        return `${pad(hours)}h ${pad(minutes)}m`;
      }

      function tick() {
        const now = Date.now() - skewMs;
        let suffix = '';
        if (status.active && status.ends_at) {
          const diff = new Date(status.ends_at).getTime() - now;
          suffix = diff > 0 ? ` — back in ${formatCountdown(diff)}` : '';
        } else if (status.scheduled && status.starts_at) {
          const diff = new Date(status.starts_at).getTime() - now;
          suffix = diff > 0 ? ` — starts in ${formatCountdown(diff)}` : '';
        }
        el.textContent = `${status.message}${suffix}`;
      }

      tick();
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(tick, 30000);
    }

    async function poll() {
      try {
        const status = await getJson(apiBase, '/api/maintenance/status');
        render(status);
      } catch (err) {
        // if the status check itself fails, don't put up a false banner
      }
    }

    poll();
    setInterval(poll, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMaintenanceBanner);
  } else {
    initMaintenanceBanner();
  }

  window.RescueWidgets = { getApiBase, escapeHtml, postJson, getJson, authFetch };
})();
