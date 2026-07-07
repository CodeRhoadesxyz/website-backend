(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-birds-grid';

  if (!window.RescueWidgets) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This widget failed to load — shared.js must be included on this page before birds-grid.js.</p>';
    }
    console.error('Rescue widget: shared.js must be loaded before birds-grid.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, getJson } = window.RescueWidgets;
  // Where the "Apply to Adopt" button on each card should link. Point this at
  // your adoption application page via data-apply-url on the script tag.
  const applyUrl = scriptEl.dataset.applyUrl || '#rescue-adoption-form';

  const STATUS_LABELS = { available: 'Available', pending: 'Pending', adopted: 'Adopted' };

  // Builds a per-bird apply link that carries the bird's name through as a
  // ?bird= parameter, so the adoption form on the other end can auto-fill its
  // "which bird" field. Works whether applyUrl is a relative page
  // ("adoption.html"), an absolute URL, or a same-page anchor
  // ("#rescue-adoption-form") — URL() resolves all three against the current
  // page and preserves any existing hash/query.
  function buildApplyHref(birdName) {
    try {
      const url = new URL(applyUrl, window.location.href);
      url.searchParams.set('bird', birdName);
      return url.toString();
    } catch (err) {
      return applyUrl;
    }
  }

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }
    container.innerHTML = `<div class="rescue-widget">Loading adoptable birds…</div>`;

    try {
      const birds = await getJson(apiBase, '/api/birds');
      if (birds.length === 0) {
        container.innerHTML = `<div class="rescue-widget"><p>No birds currently listed — check back soon!</p></div>`;
        return;
      }

      container.innerHTML = `
        <div class="rescue-widget rw-birds-wrap">
          <div class="rw-birds-grid">
            ${birds.map((b) => `
              <div class="rw-bird-card">
                ${b.photo_url
                  ? `<img class="rw-bird-photo" src="${escapeHtml(b.photo_url)}" alt="${escapeHtml(b.name)}" />`
                  : `<div class="rw-bird-photo rw-bird-photo-placeholder"></div>`}
                <div class="rw-bird-body">
                  <div class="rw-bird-name-row">
                    <span class="rw-bird-name">${escapeHtml(b.name)}</span>
                    ${b.status !== 'available' ? `<span class="rw-bird-status rw-bird-status-${escapeHtml(b.status)}">${STATUS_LABELS[b.status]}</span>` : ''}
                  </div>
                  <div class="rw-bird-meta">${escapeHtml(b.species)}${b.age ? ' · ' + escapeHtml(b.age) : ''}${b.sex ? ' · ' + escapeHtml(b.sex) : ''}</div>
                  ${b.description ? `<div class="rw-bird-desc">${escapeHtml(b.description)}</div>` : ''}
                  <a class="rw-bird-apply-btn" href="${escapeHtml(buildApplyHref(b.name))}">Apply to Adopt →</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load adoptable birds right now.</p></div>`;
    }
  }

  load();
})();
