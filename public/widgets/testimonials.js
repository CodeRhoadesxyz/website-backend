(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-testimonials';

  if (!window.RescueWidgets) {
    console.error('Rescue widget: shared.js must be loaded before testimonials.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, getJson, postJson } = window.RescueWidgets;

  function fmtDate(iso) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }
    container.innerHTML = `<div class="rescue-widget">Loading stories…</div>`;

    try {
      const stories = await getJson(apiBase, '/api/testimonials');
      container.innerHTML = `
        <div class="rescue-widget">
          <div style="margin-bottom:1.5rem;">
            <button class="rw-testimonial-share-btn" id="rw-share-story-btn">Share your story →</button>
          </div>
          <div id="rw-story-form-slot"></div>
          ${stories.length === 0
            ? '<p>No stories shared yet — be the first!</p>'
            : `<div class="rw-testimonial-grid">
                ${stories.map((s) => `
                  <div class="rw-testimonial-card">
                    ${s.photo_url ? `<img class="rw-testimonial-photo" src="${escapeHtml(s.photo_url)}" alt="" />` : ''}
                    <p class="rw-testimonial-story">"${escapeHtml(s.story)}"</p>
                    <div class="rw-testimonial-meta">— ${escapeHtml(s.author_name)}${s.bird_name ? `, adopted ${escapeHtml(s.bird_name)}` : ''} · ${fmtDate(s.created_at)}</div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      `;
      document.getElementById('rw-share-story-btn').addEventListener('click', toggleStoryForm);
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load stories right now.</p></div>`;
    }
  }

  function toggleStoryForm() {
    const slot = document.getElementById('rw-story-form-slot');
    if (slot.dataset.open === '1') {
      slot.innerHTML = '';
      slot.removeAttribute('data-open');
      return;
    }
    slot.dataset.open = '1';
    slot.innerHTML = `
      <form id="rw-story-form" class="rw-blog-inline-form" style="margin-bottom:1.5rem;">
        <label>Your name</label>
        <input name="author_name" required />
        <label>Bird's name (optional)</label>
        <input name="bird_name" placeholder="Which bird did you adopt?" />
        <label>Your story</label>
        <textarea name="story" rows="4" required placeholder="Tell us how it's going!"></textarea>
        <label>Photo URL (optional)</label>
        <input name="photo_url" placeholder="https://..." />
        <div class="rw-error" id="rw-story-error"></div>
        <button type="submit">Submit story</button>
      </form>
    `;
    const form = document.getElementById('rw-story-form');
    const errorEl = document.getElementById('rw-story-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        const result = await postJson(apiBase, '/api/testimonials', {
          author_name: form.author_name.value.trim(),
          bird_name: form.bird_name.value.trim(),
          story: form.story.value.trim(),
          photo_url: form.photo_url.value.trim(),
        });
        slot.innerHTML = `<div class="rw-success">${escapeHtml(result.message)}</div>`;
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  load();
})();
