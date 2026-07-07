(function () {
  const scriptEl = document.currentScript;
  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const containerId = scriptEl.dataset.target || 'rescue-events-list';
  const { escapeHtml, getJson, postJson } = window.RescueWidgets;

  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }
    container.innerHTML = `<div class="rescue-widget">Loading upcoming events…</div>`;

    try {
      const events = await getJson(apiBase, '/api/events');
      if (events.length === 0) {
        container.innerHTML = `<div class="rescue-widget"><p>No upcoming events right now — check back soon!</p></div>`;
        return;
      }

      container.innerHTML = `
        <div class="rescue-widget">
          ${events.map((ev) => `
            <div class="rw-event-card" id="rw-event-${ev.id}">
              <div class="rw-event-title">${escapeHtml(ev.title)}</div>
              <div class="rw-event-meta">
                ${fmt(ev.start_time)}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}
                ${ev.capacity ? ` · ${ev.rsvp_count}/${ev.capacity} spots filled` : ''}
              </div>
              ${ev.description ? `<div class="rw-event-desc">${escapeHtml(ev.description)}</div>` : ''}
              <button class="rw-rsvp-btn" data-rsvp-toggle="${ev.id}">RSVP</button>
              <div id="rw-rsvp-form-${ev.id}" style="margin-top:0.8rem; display:none;"></div>
            </div>
          `).join('')}
        </div>
      `;

      events.forEach((ev) => {
        const btn = container.querySelector(`[data-rsvp-toggle="${ev.id}"]`);
        btn.addEventListener('click', () => toggleRsvpForm(ev));
      });
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load events right now.</p></div>`;
    }
  }

  function toggleRsvpForm(ev) {
    const holder = document.getElementById(`rw-rsvp-form-${ev.id}`);
    if (holder.style.display === 'block') {
      holder.style.display = 'none';
      holder.innerHTML = '';
      return;
    }

    holder.style.display = 'block';
    holder.innerHTML = `
      <form>
        <label>Name *</label>
        <input name="name" required />
        <label>Email *</label>
        <input name="email" type="email" required />
        <label>Phone</label>
        <input name="phone" type="tel" />
        <label>Number of guests</label>
        <input name="guests" type="number" min="0" value="0" />
        <div class="rw-error"></div>
        <button type="submit">Confirm RSVP</button>
      </form>
    `;

    const form = holder.querySelector('form');
    const errorEl = holder.querySelector('.rw-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        guests: Number(form.elements.guests.value) || 0,
      };

      try {
        await postJson(apiBase, `/api/events/${ev.id}/rsvp`, payload);
        holder.innerHTML = `<div class="rw-success">You're on the list! See you there.</div>`;
      } catch (err) {
        errorEl.textContent = err.message;
        submitBtn.disabled = false;
      }
    });
  }

  load();
})();
