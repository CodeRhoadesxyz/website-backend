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

  window.RescueWidgets = { getApiBase, escapeHtml, postJson, getJson, authFetch };
})();
