(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-relinquishment-form';

  if (!window.RescueWidgets || typeof window.RescueWidgets.renderForm !== 'function') {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This form failed to load — shared.js and form-builder.js must both be included on this page before relinquishment-form.js.</p>';
    }
    console.error('Rescue widget: shared.js and form-builder.js must be loaded before relinquishment-form.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);

  window.RescueWidgets.renderForm(containerId, {
    type: 'relinquishment',
    apiBase,
    title: 'Bird Relinquishment Form',
    intro: 'If you need to surrender a parrot into our care, please share the details below and we will follow up.',
    submitLabel: 'Submit form',
    fields: [
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: true },
      { name: 'birdSpecies', label: 'Species', required: true },
      { name: 'birdAge', label: "Bird's age (approximate)", required: false },
      { name: 'birdHealth', label: 'Current health / behavioral notes', type: 'textarea', required: false },
      { name: 'reasonForRelinquishment', label: 'Reason for relinquishment', type: 'textarea', required: true },
    ],
  });
})();
