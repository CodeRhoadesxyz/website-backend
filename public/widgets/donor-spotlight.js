(function () {
  const scriptEl = document.currentScript;
  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const containerId = scriptEl.dataset.target || 'rescue-donor-spotlight';
  const cycleMs = Number(scriptEl.dataset.cycleMs) || 4000;
  const { escapeHtml, getJson } = window.RescueWidgets;

  let donors = [];
  let index = 0;
  let timer = null;

  function fmtWeekRange(startIso, endIso) {
    const opts = { month: 'short', day: 'numeric' };
    const start = new Date(`${startIso}T00:00:00`).toLocaleDateString(undefined, opts);
    const end = new Date(`${endIso}T00:00:00`).toLocaleDateString(undefined, opts);
    return `${start} – ${end}`;
  }

  function render(container, weekLabel) {
    const donor = donors[index];
    container.innerHTML = `
      <div class="rescue-widget rw-donor-spotlight">
        <div class="rw-donor-label">This week's top donors${weekLabel ? ` · ${escapeHtml(weekLabel)}` : ''}</div>
        <div class="rw-donor-rank">#${index + 1}</div>
        <div class="rw-donor-name">${escapeHtml(donor.donor_name)}</div>
        <div class="rw-donor-dots">
          ${donors.map((_, i) => `<span class="rw-donor-dot${i === index ? ' active' : ''}"></span>`).join('')}
        </div>
      </div>
    `;
  }

  async function load() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    try {
      const data = await getJson(apiBase, '/api/donations/public-leaderboard');
      donors = data.top_donors || [];

      if (donors.length === 0) {
        // No one has opted in to public recognition this week — collapse
        // rather than show an empty widget.
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const weekLabel = data.week_start && data.week_end ? fmtWeekRange(data.week_start, data.week_end) : '';
      container.style.display = '';
      index = 0;
      render(container, weekLabel);

      if (timer) clearInterval(timer);
      if (donors.length > 1) {
        timer = setInterval(() => {
          index = (index + 1) % donors.length;
          render(container, weekLabel);
        }, cycleMs);
      }
    } catch (err) {
      // Fail silently rather than showing an error widget to every visitor.
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }

  load();

  // Refresh periodically so the widget naturally rolls over to the new
  // week's donors without needing a page reload — checking every 30
  // minutes is plenty since the underlying list only changes at most once
  // a week (or when an admin logs/edits a donation).
  setInterval(load, 30 * 60 * 1000);
})();
