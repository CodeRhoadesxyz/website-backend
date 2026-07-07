(function () {
  const scriptEl = document.currentScript;
  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const containerId = scriptEl.dataset.target || 'rescue-volunteer-form';

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
      { name: 'interests', label: 'What would you like to help with? (events, bird care, transport, admin, etc.)', type: 'textarea', required: true },
      { name: 'availability', label: 'General availability', required: false },
      { name: 'experience', label: 'Relevant experience', type: 'textarea', required: false },
    ],
  });
})();
