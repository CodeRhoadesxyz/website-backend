(function () {
  function renderForm(containerId, { type, apiBase, title, intro, fields, submitLabel }) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    const { escapeHtml, postJson } = window.RescueWidgets;

    const fieldHtml = fields.map((f) => {
      const req = f.required !== false;
      const initialValue = f.value || '';
      if (f.type === 'textarea') {
        return `
          <div>
            <label for="${f.name}">${escapeHtml(f.label)}${req ? ' *' : ''}</label>
            <textarea id="${f.name}" name="${f.name}" rows="${f.rows || 3}" ${req ? 'required' : ''}>${escapeHtml(initialValue)}</textarea>
          </div>`;
      }
      if (f.type === 'select') {
        return `
          <div>
            <label for="${f.name}">${escapeHtml(f.label)}${req ? ' *' : ''}</label>
            <select id="${f.name}" name="${f.name}" ${req ? 'required' : ''}>
              ${f.options.map((opt) => `<option value="${escapeHtml(opt)}" ${opt === initialValue ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>`;
      }
      return `
        <div>
          <label for="${f.name}">${escapeHtml(f.label)}${req ? ' *' : ''}</label>
          <input id="${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${escapeHtml(initialValue)}" ${req ? 'required' : ''} />
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="rescue-widget">
        ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
        ${intro ? `<p>${escapeHtml(intro)}</p>` : ''}
        <form id="${containerId}-form">
          ${fieldHtml}
          <div class="rw-error" id="${containerId}-error"></div>
          <button type="submit">${escapeHtml(submitLabel || 'Submit')}</button>
        </form>
      </div>
    `;

    const form = document.getElementById(`${containerId}-form`);
    const errorEl = document.getElementById(`${containerId}-error`);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {};
      fields.forEach((f) => { payload[f.name] = form.elements[f.name].value.trim(); });

      try {
        await postJson(apiBase, `/api/applications/${type}`, payload);
        container.innerHTML = `
          <div class="rescue-widget">
            <div class="rw-success">Thank you — your ${type} application has been received. We'll be in touch soon.</div>
          </div>`;
      } catch (err) {
        errorEl.textContent = err.message;
        submitBtn.disabled = false;
      }
    });
  }

  window.RescueWidgets = window.RescueWidgets || {};
  window.RescueWidgets.renderForm = renderForm;
})();
