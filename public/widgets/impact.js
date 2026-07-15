(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-impact';

  if (!window.RescueWidgets) {
    console.error('Rescue widget: shared.js must be loaded before impact.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { getJson } = window.RescueWidgets;

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    try {
      const stats = await getJson(apiBase, '/api/impact');

      const items = [
        { value: stats.birdsAdopted, label: 'Birds adopted' },
        { value: stats.totalBirdsHelped, label: 'Birds helped in total' },
        { value: `${stats.adoptionRate}%`, label: 'Adoption rate' },
        { value: stats.eventsHosted, label: 'Events hosted' },
      ];

      container.innerHTML = `
        <div class="rescue-widget rw-impact-wrap">
          <div class="rw-impact-grid">
            ${items.map((i) => `
              <div class="rw-impact-stat">
                <div class="rw-impact-number">${i.value}</div>
                <div class="rw-impact-label">${i.label}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      // Fail quietly on the homepage rather than showing an error to every visitor.
      const container2 = document.getElementById(containerId);
      if (container2) container2.innerHTML = '';
    }
  }

  load();
})();
