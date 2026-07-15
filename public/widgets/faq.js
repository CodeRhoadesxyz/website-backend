(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-faq';

  if (!window.RescueWidgets) {
    console.error('Rescue widget: shared.js must be loaded before faq.js.');
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
      const faqs = await getJson(apiBase, '/api/faqs');
      if (faqs.length === 0) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = `
        <div class="rescue-widget">
          ${faqs.map((f, i) => `
            <details class="rw-faq-item" ${i === 0 ? 'open' : ''}>
              <summary class="rw-faq-question">${escapeHtml(f.question)}</summary>
              <div class="rw-faq-answer">${escapeHtml(f.answer)}</div>
            </details>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="rescue-widget"><p class="rw-error">Could not load FAQs right now.</p></div>`;
    }
  }

  load();
})();
