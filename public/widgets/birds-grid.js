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
  const { escapeHtml, getJson, postJson } = window.RescueWidgets;

  // Optional: if you have a separate, dedicated adoption application page and
  // want the button to link there instead of popping up in place, set
  // data-apply-url on this script tag to that page's URL. Leave it unset
  // (the default) for the button to open the adoption form as an in-page
  // popup instead — no extra page needed.
  const applyUrl = scriptEl.dataset.applyUrl || '';

  const STATUS_LABELS = { available: 'Available', pending: 'Pending', adopted: 'Adopted' };

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
                  <div class="rw-bird-actions">
                    ${applyUrl
                      ? `<a class="rw-bird-apply-btn" href="${escapeHtml(buildApplyHref(b.name))}">Apply to Adopt →</a>`
                      : `<button class="rw-bird-apply-btn" data-apply-bird="${escapeHtml(b.name)}">Apply to Adopt →</button>`}
                    ${b.status === 'pending' ? `<button class="rw-bird-waitlist-btn" data-waitlist-bird="${b.id}" data-waitlist-name="${escapeHtml(b.name)}">Join waitlist</button>` : ''}
                    ${b.sponsor_url ? `<a class="rw-bird-sponsor-btn" href="${escapeHtml(b.sponsor_url)}" target="_blank" rel="noopener">Sponsor ${escapeHtml(b.name)} 💚</a>` : ''}
                  </div>
                  <div id="rw-waitlist-form-${b.id}" style="margin-top:0.6rem; display:none;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (!applyUrl) {
        container.querySelectorAll('[data-apply-bird]').forEach((btn) => {
          btn.addEventListener('click', () => openApplyModal(btn.dataset.applyBird));
        });
      }
      container.querySelectorAll('[data-waitlist-bird]').forEach((btn) => {
        btn.addEventListener('click', () => toggleWaitlistForm(btn.dataset.waitlistBird, btn.dataset.waitlistName));
      });
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load adoptable birds right now.</p></div>`;
    }
  }

  function toggleWaitlistForm(birdId, birdName) {
    const holder = document.getElementById(`rw-waitlist-form-${birdId}`);
    if (holder.style.display === 'block') {
      holder.style.display = 'none';
      holder.innerHTML = '';
      return;
    }
    holder.style.display = 'block';
    holder.innerHTML = `
      <form class="rw-blog-inline-form">
        <label>Name</label>
        <input name="name" required />
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Phone (optional)</label>
        <input name="phone" type="tel" />
        <div class="rw-error"></div>
        <button type="submit">Join waitlist for ${escapeHtml(birdName)}</button>
      </form>
    `;
    const form = holder.querySelector('form');
    const errorEl = holder.querySelector('.rw-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        const result = await postJson(apiBase, '/api/waitlist', {
          bird_id: birdId,
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          phone: form.phone.value.trim(),
        });
        holder.innerHTML = `<div class="rw-success">${escapeHtml(result.message)}</div>`;
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  function openApplyModal(birdName) {
    if (!window.RescueWidgets.renderAdoptionForm) {
      alert('The application form failed to load — form-builder.js and adoption-form.js must both be included on this page.');
      console.error('Rescue widget: form-builder.js and adoption-form.js must be loaded before birds-grid.js for the popup application to work.');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'rw-modal-backdrop';
    backdrop.innerHTML = `
      <div class="rw-modal">
        <button class="rw-modal-close" aria-label="Close">✕</button>
        <div id="rw-apply-modal-slot"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    function close() {
      backdrop.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }

    backdrop.querySelector('.rw-modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKeydown);

    window.RescueWidgets.renderAdoptionForm('rw-apply-modal-slot', { apiBase, prefillBird: birdName });
  }

  load();
})();
