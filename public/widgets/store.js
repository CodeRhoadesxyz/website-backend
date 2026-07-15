(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-store';

  if (!window.RescueWidgets) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This widget failed to load — shared.js must be included on this page before store.js.</p>';
    }
    console.error('Rescue widget: shared.js must be loaded before store.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, getJson } = window.RescueWidgets;

  function fmtMoney(n) {
    return `$${Number(n).toFixed(2)}`;
  }

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }
    container.innerHTML = `<div class="rescue-widget">Loading store…</div>`;

    try {
      const items = await getJson(apiBase, '/api/store');
      if (items.length === 0) {
        container.innerHTML = `<div class="rescue-widget"><p>Nothing in the store right now — check back soon!</p></div>`;
        return;
      }

      container.innerHTML = `
        <div class="rescue-widget rw-store-wrap">
          <div class="rw-store-grid">
            ${items.map((item) => `
              <div class="rw-store-card">
                ${item.image_url
                  ? `<img class="rw-store-photo" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" />`
                  : `<div class="rw-store-photo rw-store-photo-placeholder"></div>`}
                <div class="rw-store-body">
                  <div class="rw-store-badges">
                    ${item.is_clearance ? '<span class="rw-store-badge rw-store-badge-clearance">Clearance</span>' : ''}
                    ${item.is_on_sale ? '<span class="rw-store-badge rw-store-badge-sale">Sale</span>' : ''}
                    ${item.is_sold_out ? '<span class="rw-store-badge rw-store-badge-soldout">Sold Out</span>' : ''}
                  </div>
                  <div class="rw-store-name">${escapeHtml(item.name)}</div>
                  ${item.description ? `<div class="rw-store-desc">${escapeHtml(item.description)}</div>` : ''}
                  <div class="rw-store-price">
                    ${item.is_on_sale
                      ? `<span class="rw-store-price-was">${fmtMoney(item.price)}</span> <span class="rw-store-price-now">${fmtMoney(item.sale_price)}</span>`
                      : `<span class="rw-store-price-now">${fmtMoney(item.price)}</span>`}
                  </div>
                  ${item.is_sold_out
                    ? `<span class="rw-store-buy-btn rw-store-buy-btn-disabled">Sold Out</span>`
                    : item.buy_url
                      ? `<a class="rw-store-buy-btn" href="${escapeHtml(item.buy_url)}" target="_blank" rel="noopener">Buy Now →</a>`
                      : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load the store right now.</p></div>`;
    }
  }

  load();
})();
