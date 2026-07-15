(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-wishlist';

  if (!window.RescueWidgets) {
    console.error('Rescue widget: shared.js must be loaded before wishlist.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, getJson } = window.RescueWidgets;

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }
    container.innerHTML = `<div class="rescue-widget">Loading…</div>`;

    try {
      const items = await getJson(apiBase, '/api/wishlist');
      if (items.length === 0) {
        container.innerHTML = `<div class="rescue-widget"><p>We're all stocked up right now — thank you! Check back soon.</p></div>`;
        return;
      }
      container.innerHTML = `
        <div class="rescue-widget">
          <ul class="rw-wishlist-list">
            ${items.map((i) => `
              <li class="rw-wishlist-item">
                <strong>${escapeHtml(i.item_name)}</strong>
                ${i.quantity_needed ? `<span class="rw-wishlist-qty">${escapeHtml(i.quantity_needed)}</span>` : ''}
                ${i.description ? `<div class="rw-wishlist-desc">${escapeHtml(i.description)}</div>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load the wishlist right now.</p></div>`;
    }
  }

  load();
})();
