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

  window.RescueWidgets = { getApiBase, escapeHtml, postJson, getJson };
})();
