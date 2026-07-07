(function () {
  const scriptEl = document.currentScript;
  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const containerId = scriptEl.dataset.target || 'rescue-announcement-banner';
  const { escapeHtml, getJson } = window.RescueWidgets;

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    try {
      const announcement = await getJson(apiBase, '/api/announcements/latest');

      if (!announcement) {
        // Nothing published — collapse completely so no empty space is left
        // above "Our Mission" (or wherever this is embedded).
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const link = announcement.link_url
        ? `<a class="rw-a-link" href="${escapeHtml(announcement.link_url)}">${escapeHtml(announcement.link_text || 'Learn more')} →</a>`
        : '';

      container.style.display = '';
      container.innerHTML = `
        <div class="rescue-widget rw-announcement-wrap">
          <div class="rw-announcement">
            <span class="rw-a-dot"></span>
            <span class="rw-a-title">${escapeHtml(announcement.title)}</span>
            <span class="rw-a-message">— ${escapeHtml(announcement.message)}</span>
            ${link}
          </div>
        </div>
      `;
    } catch (err) {
      // Fail silently on the homepage rather than showing an error banner to every visitor.
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }

  load();
})();
