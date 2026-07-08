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
    let bannerEl = null;   // small heads-up banner, used for "scheduled" (not yet active)
    let overlayEl = null;  // full-page block, used once maintenance is actually active

    function formatCountdown(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const pad = (n) => String(n).padStart(2, '0');
      if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
      return `${pad(hours)}h ${pad(minutes)}m`;
    }

    function ensureBanner() {
      if (bannerEl) return bannerEl;
      bannerEl = document.createElement('div');
      bannerEl.id = 'rescue-maintenance-banner';
      bannerEl.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483000',
        'background:#3a2a24', 'color:#f2e9df', 'font-family:system-ui,sans-serif',
        'padding:0.65rem 1rem', 'text-align:center', 'font-size:0.9rem',
        'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
      ].join(';');
      document.body.prepend(bannerEl);
      return bannerEl;
    }

    function removeBanner() {
      if (bannerEl) { bannerEl.remove(); bannerEl = null; }
    }

    // Full-page block: covers the entire viewport above everything else on
    // the page, and locks background scroll, so a visitor can't see or
    // interact with any widget content underneath while maintenance is
    // actively on. This is the closest this backend can get to taking the
    // whole site down — it can't touch the main site's own HTML/hosting,
    // only what loads through the embedded widget scripts, so any page that
    // doesn't include shared.js at all won't be covered.
    function ensureOverlay() {
      if (overlayEl) return overlayEl;
      overlayEl = document.createElement('div');
      overlayEl.id = 'rescue-maintenance-overlay';
      overlayEl.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:#3a2a24', 'color:#f2e9df', 'font-family:system-ui,sans-serif',
        'display:flex', 'align-items:center', 'justify-content:center',
        'text-align:center', 'padding:2rem',
      ].join(';');
      overlayEl.innerHTML = `
        <div style="max-width:32rem;">
          <div style="font-size:1.4rem; font-weight:600; margin-bottom:0.75rem;">We'll be right back</div>
          <div id="rescue-maintenance-overlay-text" style="font-size:1rem; line-height:1.5; opacity:0.9;"></div>
        </div>
      `;
      document.documentElement.style.overflow = 'hidden';
      document.body.appendChild(overlayEl);
      return overlayEl;
    }

    function removeOverlay() {
      if (overlayEl) { overlayEl.remove(); overlayEl = null; document.documentElement.style.overflow = ''; }
    }

    function render(status) {
      if (status.active) {
        removeBanner();
        const el = ensureOverlay();
        const textEl = el.querySelector('#rescue-maintenance-overlay-text');
        const skewMs = Date.now() - new Date(status.server_time).getTime();

        function tick() {
          const now = Date.now() - skewMs;
          let suffix = '';
          if (status.ends_at) {
            const diff = new Date(status.ends_at).getTime() - now;
            suffix = diff > 0 ? ` — back in ${formatCountdown(diff)}` : '';
          }
          textEl.textContent = `${status.message}${suffix}`;
        }

        tick();
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(tick, 30000);
        return;
      }

      removeOverlay();

      if (status.scheduled) {
        const el = ensureBanner();
        const skewMs = Date.now() - new Date(status.server_time).getTime();

        function tick() {
          const now = Date.now() - skewMs;
          let suffix = '';
          if (status.starts_at) {
            const diff = new Date(status.starts_at).getTime() - now;
            suffix = diff > 0 ? ` — starts in ${formatCountdown(diff)}` : '';
          }
          el.textContent = `${status.message}${suffix}`;
        }

        tick();
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(tick, 30000);
        return;
      }

      if (countdownTimer) clearInterval(countdownTimer);
      removeBanner();
    }

    async function poll() {
      try {
        const status = await getJson(apiBase, '/api/maintenance/status');
        render(status);
      } catch (err) {
        // if the status check itself fails, don't put up a false banner/overlay
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
