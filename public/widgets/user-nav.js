(function () {
  const scriptEl = document.currentScript;

  if (!window.RescueWidgets) {
    console.error('Rescue widget: shared.js must be loaded before user-nav.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, authFetch } = window.RescueWidgets;

  // Where the dropdown's two links go, once signed in. Configurable via
  // data attributes on the script tag so this works regardless of what
  // your actual page URLs are, e.g.:
  //   <script src=".../user-nav.js" data-community-url="/community.html" data-dashboard-url="/my-account.html"></script>
  // Fall back to the same page names the rest of the widget set already
  // assumes (BLOG_PAGE_URL defaults to /blog.html server-side).
  const communityUrl = (scriptEl && scriptEl.dataset.communityUrl) || '/blog.html';
  const dashboardUrl = (scriptEl && scriptEl.dataset.dashboardUrl) || '/dashboard.html';

  let currentUser = null;
  let badge = null;
  let dropdownOpen = false;

  function avatarHtml(user, size) {
    if (user.avatar_url) {
      return `<img class="rw-nav-avatar" style="width:${size}px;height:${size}px;" src="${escapeHtml(user.avatar_url)}" alt="" />`;
    }
    const initial = (user.display_name || user.username || '?').trim().charAt(0).toUpperCase();
    return `<span class="rw-nav-avatar rw-nav-avatar-fallback" style="width:${size}px;height:${size}px;line-height:${size}px;">${escapeHtml(initial)}</span>`;
  }

  function render() {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'rw-nav-badge';
      document.body.appendChild(badge);
    }

    if (currentUser) {
      badge.innerHTML = `
        <div class="rw-nav-account">
          <button class="rw-nav-account-btn" id="rw-nav-toggle" type="button">
            ${avatarHtml(currentUser, 26)}
            <span class="rw-nav-name">${escapeHtml(currentUser.display_name)}</span>
          </button>
          <div class="rw-nav-dropdown" id="rw-nav-dropdown" style="display:${dropdownOpen ? 'block' : 'none'};">
            <a href="${escapeHtml(dashboardUrl)}" class="rw-nav-dropdown-item">My applications &amp; chats</a>
            <a href="${escapeHtml(communityUrl)}" class="rw-nav-dropdown-item">Community</a>
            <button class="rw-nav-dropdown-item rw-nav-logout" id="rw-nav-logout" type="button">Log out</button>
          </div>
        </div>
      `;

      document.getElementById('rw-nav-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownOpen = !dropdownOpen;
        render();
      });
      document.getElementById('rw-nav-logout').addEventListener('click', async () => {
        try {
          await authFetch(apiBase, '/api/users/logout', { method: 'POST' });
        } catch (err) {
          // even if the network call fails, treat the user as logged out locally
        }
        currentUser = null;
        dropdownOpen = false;
        render();
      });
    } else {
      badge.innerHTML = `
        <div class="rw-nav-guest">
          <button class="rw-nav-link-btn" id="rw-nav-login-btn" type="button">Log in</button>
          <button class="rw-nav-signup-btn" id="rw-nav-signup-btn" type="button">Sign up</button>
        </div>
        <div class="rw-nav-dropdown rw-nav-auth-dropdown" id="rw-nav-auth-dropdown" style="display:none;"></div>
      `;
      document.getElementById('rw-nav-login-btn').addEventListener('click', () => toggleAuthForm('login'));
      document.getElementById('rw-nav-signup-btn').addEventListener('click', () => toggleAuthForm('signup'));
    }
  }

  function toggleAuthForm(mode) {
    const dropdown = document.getElementById('rw-nav-auth-dropdown');
    if (dropdown.dataset.mode === mode && dropdown.style.display !== 'none') {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      delete dropdown.dataset.mode;
      return;
    }
    dropdown.dataset.mode = mode;
    dropdown.style.display = 'block';

    if (mode === 'login') {
      dropdown.innerHTML = `
        <form id="rw-nav-login-form" class="rw-nav-inline-form">
          <label>Username</label>
          <input name="username" required />
          <label>Password</label>
          <input name="password" type="password" required />
          <div class="rw-error" id="rw-nav-login-error"></div>
          <button type="submit">Log in</button>
        </form>
      `;
      const form = document.getElementById('rw-nav-login-form');
      const errorEl = document.getElementById('rw-nav-login-error');
      form.addEventListener('click', (e) => e.stopPropagation());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          currentUser = await authFetch(apiBase, '/api/users/login', {
            method: 'POST',
            body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
          });
          dropdownOpen = false;
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    } else {
      dropdown.innerHTML = `
        <form id="rw-nav-signup-form" class="rw-nav-inline-form">
          <label>Display name</label>
          <input name="display_name" required />
          <label>Username</label>
          <input name="username" required placeholder="3-30 characters, no spaces" />
          <label>Email</label>
          <input name="email" type="email" required />
          <label>Password</label>
          <input name="password" type="password" required placeholder="At least 8 characters" />
          <div class="rw-error" id="rw-nav-signup-error"></div>
          <button type="submit">Create account</button>
        </form>
      `;
      const form = document.getElementById('rw-nav-signup-form');
      const errorEl = document.getElementById('rw-nav-signup-error');
      form.addEventListener('click', (e) => e.stopPropagation());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          currentUser = await authFetch(apiBase, '/api/users/signup', {
            method: 'POST',
            body: JSON.stringify({
              display_name: form.display_name.value.trim(),
              username: form.username.value.trim(),
              email: form.email.value.trim(),
              password: form.password.value,
            }),
          });
          dropdownOpen = false;
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    }
  }

  // Close the dropdown when clicking anywhere else on the page.
  document.addEventListener('click', (e) => {
    if (badge && !badge.contains(e.target)) {
      if (dropdownOpen) {
        dropdownOpen = false;
        render();
      }
      const authDropdown = document.getElementById('rw-nav-auth-dropdown');
      if (authDropdown) {
        authDropdown.style.display = 'none';
        authDropdown.innerHTML = '';
      }
    }
  });

  async function boot() {
    try {
      currentUser = await authFetch(apiBase, '/api/users/me');
    } catch (err) {
      currentUser = null;
    }
    render();
  }

  boot();
})();
