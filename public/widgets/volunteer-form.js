(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-volunteer-form';

  if (!window.RescueWidgets || typeof window.RescueWidgets.renderForm !== 'function') {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This form failed to load — shared.js and form-builder.js must both be included on this page before volunteer-form.js.</p>';
    }
    console.error('Rescue widget: shared.js and form-builder.js must be loaded before volunteer-form.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);

  window.RescueWidgets.renderForm(containerId, {
    type: 'volunteer',
    apiBase,
    title: 'Volunteer Application',
    intro: "We'd love your help. Tell us a bit about yourself and how you'd like to get involved.",
    submitLabel: 'Submit application',
    fields: [
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: true },
      { name: 'interests', label: 'What would you like to help with? (events, bird care, transport, etc.)', type: 'textarea', required: true },
      { name: 'availability', label: 'General availability', required: false },
      { name: 'experience', label: 'Relevant experience', type: 'textarea', required: false },
    ],
  });
})();
