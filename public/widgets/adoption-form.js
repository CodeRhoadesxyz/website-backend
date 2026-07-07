(function () {
  // Exposed so other widgets (like the adoptable birds grid) can pop this
  // form into a modal, pre-filled for a specific bird, without duplicating
  // the field list. Standalone use (a dedicated adoption page) still works
  // too — see the auto-render block at the bottom of this file.
  function renderAdoptionForm(containerId, { apiBase, prefillBird } = {}) {
    if (!window.RescueWidgets || typeof window.RescueWidgets.renderForm !== 'function') {
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This form failed to load — shared.js and form-builder.js must both be included on this page before adoption-form.js.</p>';
      }
      console.error('Rescue widget: shared.js and form-builder.js must be loaded before adoption-form.js.');
      return;
    }

    window.RescueWidgets.renderForm(containerId, {
      type: 'adoption',
      apiBase,
      title: 'Adoption Application',
      intro: 'Tell us about your home and experience so we can find the right match for one of our parrots.',
      submitLabel: 'Submit application',
      fields: [
        { name: 'fullName', label: 'Full name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true },
        { name: 'address', label: 'Home address', required: false },
        { name: 'whichBird', label: 'Which bird are you interested in? (if any)', required: false, value: prefillBird || '' },
        { name: 'homeType', label: 'Home type', type: 'select', options: ['House', 'Apartment/Condo', 'Other'], required: false },
        { name: 'birdExperience', label: 'Prior experience with parrots', type: 'textarea', required: true },
        { name: 'aboutHousehold', label: 'Tell us about your household (other pets, children, daily schedule)', type: 'textarea', required: true },
      ],
    });
  }

  window.RescueWidgets = window.RescueWidgets || {};
  window.RescueWidgets.renderAdoptionForm = renderAdoptionForm;

  // Standalone auto-render: if a dedicated container for this form exists on
  // the current page (e.g. a stand-alone adoption application page), render
  // straight into it automatically — same behavior as before this refactor.
  // If it's not present (e.g. this script is only here to support the birds
  // grid's popup modal), this quietly does nothing.
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-adoption-form';
  if (document.getElementById(containerId)) {
    const apiBase = window.RescueWidgets.getApiBase(scriptEl);
    const prefillBird = new URLSearchParams(window.location.search).get('bird') || '';
    renderAdoptionForm(containerId, { apiBase, prefillBird });
  }
})();
