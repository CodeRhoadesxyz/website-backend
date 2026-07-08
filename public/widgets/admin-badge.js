(function () {
  // Deliberately does NOT use getApiBase/data-api-base like the other widgets.
  // The admin session cookie is SameSite=Lax (same-origin only, by design —
  // see routes/auth.js), so this only ever works as a same-origin request to
  // your own domain, which your Cloudflare Worker (or PHP proxy) already
  // routes to the backend. There's nothing to configure here.
  async function checkAdminAndShowBadge() {
    let me;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return; // not signed in — completely normal for every regular visitor, nothing to show
      me = await res.json();
    } catch (err) {
      return; // network hiccup — fail quietly, this is a nice-to-have, not core functionality
    }

    const badge = document.createElement('a');
    badge.href = '/admin/index.html';
    badge.className = 'rw-admin-badge';
    badge.textContent = `Admin: ${me.username} →`;
    document.body.appendChild(badge);
  }

  checkAdminAndShowBadge();
})();
