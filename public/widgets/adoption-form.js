(function () {
  const scriptEl = document.currentScript;
  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const containerId = scriptEl.dataset.target || 'rescue-adoption-form';

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
      { name: 'whichBird', label: 'Which bird are you interested in? (if any)', required: false },
      { name: 'homeType', label: 'Home type', type: 'select', options: ['House', 'Apartment/Condo', 'Other'], required: false },
      { name: 'birdExperience', label: 'Prior experience with parrots', type: 'textarea', required: true },
      { name: 'aboutHousehold', label: 'Tell us about your household (other pets, children, daily schedule)', type: 'textarea', required: true },
    ],
  });
})();
