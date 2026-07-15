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
        <div class="rescue-widget rw-testimonial-wrap">
          <div class="rw-testimonial-header">
            <h3>Happy tails</h3>
            <p class="rw-testimonial-subhead">Stories from the families our birds have joined</p>
            <button class="rw-testimonial-share-btn" id="rw-share-story-btn">Share your story →</button>
          </div>
          <div id="rw-story-form-slot"></div>
          ${stories.length === 0
            ? '<p class="rw-testimonial-empty">No stories shared yet — be the first!</p>'
            : `<div class="rw-testimonial-grid">
                ${stories.map((s) => `
                  <div class="rw-testimonial-card">
                    <div class="rw-testimonial-quote-mark">&ldquo;</div>
                    ${s.photo_url
                      ? `<img class="rw-testimonial-photo" src="${escapeHtml(s.photo_url)}" alt="" />`
                      : `<div class="rw-testimonial-photo rw-testimonial-photo-placeholder">${escapeHtml((s.author_name || '?').trim().charAt(0).toUpperCase())}</div>`
                    }
                    <p class="rw-testimonial-story">${escapeHtml(s.story)}</p>
                    <div class="rw-testimonial-meta">${escapeHtml(s.author_name)}${s.bird_name ? `<span class="rw-testimonial-bird"> · adopted ${escapeHtml(s.bird_name)}</span>` : ''}</div>
                    <div class="rw-testimonial-date">${fmtDate(s.created_at)}</div>
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
        <label>Your photo (optional)</label>
        <input type="file" id="rw-story-photo-file" accept="image/jpeg,image/png,image/webp,image/gif" />
        <div id="rw-story-photo-status" class="rw-testimonial-photo-status"></div>
        <div id="rw-story-photo-preview"></div>
        <div class="rw-error" id="rw-story-error"></div>
        <button type="submit">Submit story</button>
      </form>
    `;
    const form = document.getElementById('rw-story-form');
    const errorEl = document.getElementById('rw-story-error');
    const fileInput = document.getElementById('rw-story-photo-file');
    const statusEl = document.getElementById('rw-story-photo-status');
    const preview = document.getElementById('rw-story-photo-preview');
    const submitBtn = form.querySelector('button[type="submit"]');

    let uploadedPhotoUrl = '';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      uploadedPhotoUrl = '';
      statusEl.textContent = 'Uploading…';
      preview.innerHTML = '';
      submitBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('image', file);
        // Raw fetch, not postJson — a multipart upload needs the browser to
        // set its own Content-Type boundary, which postJson's fixed
        // 'application/json' header would break.
        const res = await fetch(`${apiBase}/api/upload/public`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');

        uploadedPhotoUrl = `${apiBase}${data.url}`;
        statusEl.textContent = 'Photo attached ✓';
        preview.innerHTML = `<img src="${uploadedPhotoUrl}" alt="" style="max-height:90px; border-radius:10px; margin-top:0.4rem;" />`;
      } catch (err) {
        statusEl.textContent = '';
        errorEl.textContent = err.message;
        fileInput.value = '';
      } finally {
        submitBtn.disabled = false;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        const result = await postJson(apiBase, '/api/testimonials', {
          author_name: form.author_name.value.trim(),
          bird_name: form.bird_name.value.trim(),
          story: form.story.value.trim(),
          photo_url: uploadedPhotoUrl,
        });
        slot.innerHTML = `<div class="rw-success">${escapeHtml(result.message)}</div>`;
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  load();
})();
