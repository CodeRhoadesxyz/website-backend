(function () {
  const scriptEl = document.currentScript;
  const containerId = scriptEl.dataset.target || 'rescue-blog';

  if (!window.RescueWidgets) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="color:#c1554a; font-size:0.9rem;">This widget failed to load — shared.js must be included on this page before blog.js.</p>';
    }
    console.error('Rescue widget: shared.js must be loaded before blog.js.');
    return;
  }

  const apiBase = window.RescueWidgets.getApiBase(scriptEl);
  const { escapeHtml, authFetch } = window.RescueWidgets;

  let currentUser = null;
  let container = null;

  // Mirrors the backend's POSTER_ROLES list — this is only for showing/hiding
  // the "+ New post" button appropriately. The server enforces the real rule
  // independently, so this being out of sync would just be a cosmetic issue,
  // not a security one.
  const POSTER_ROLES = ['founder', 'vice president', 'website developer'];
  function canPost(user) {
    return Boolean(user && user.role) && POSTER_ROLES.includes(user.role.trim().toLowerCase());
  }

  function fmtDate(iso) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Renders a small round avatar image, or a circle with the person's first
  // initial if they haven't set a profile picture.
  // Renders a small badge (e.g. "Founder") next to a name, or nothing if no
  // role is set — admin-assigned only, from the Community tab.
  function roleBadgeHtml(role) {
    return role ? `<span class="rw-blog-role-badge">${escapeHtml(role)}</span>` : '';
  }

  function avatarHtml(name, url, size) {
    if (url) {
      return `<img class="rw-blog-avatar" style="width:${size}px;height:${size}px;" src="${escapeHtml(url)}" alt="" />`;
    }
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    return `<span class="rw-blog-avatar rw-blog-avatar-fallback" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${Math.round(size * 0.45)}px;">${escapeHtml(initial)}</span>`;
  }

  function getRoute() {
    const match = window.location.hash.match(/^#post-(\d+)/);
    return match ? { view: 'post', id: match[1] } : { view: 'list' };
  }

  async function boot() {
    container = document.getElementById(containerId);
    if (!container) {
      console.error(`Rescue widget: no element with id "${containerId}" found.`);
      return;
    }

    const resetToken = new URLSearchParams(window.location.search).get('reset');
    if (resetToken) {
      renderResetPasswordView(resetToken);
      return;
    }

    try {
      currentUser = await authFetch(apiBase, '/api/users/me');
    } catch (err) {
      currentUser = null; // not signed in — completely normal, not an error state
    }

    render();
    window.addEventListener('hashchange', render);
  }

  function renderResetPasswordView(token) {
    container.innerHTML = `
      <div class="rescue-widget rw-blog-wrap">
        <h3 style="margin-bottom:0.75rem;">Set a new password</h3>
        <form id="rw-reset-form" class="rw-blog-inline-form">
          <label>New password</label>
          <input name="password" type="password" required placeholder="At least 8 characters" />
          <label>Confirm new password</label>
          <input name="confirm" type="password" required />
          <div class="rw-error" id="rw-reset-error"></div>
          <button type="submit">Set new password</button>
        </form>
      </div>
    `;
    const form = document.getElementById('rw-reset-form');
    const errorEl = document.getElementById('rw-reset-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      if (form.password.value !== form.confirm.value) {
        errorEl.textContent = "Passwords don't match.";
        return;
      }
      try {
        const result = await authFetch(apiBase, '/api/users/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, password: form.password.value }),
        });
        container.innerHTML = `
          <div class="rescue-widget rw-blog-wrap">
            <p class="rw-success">${escapeHtml(result.message)}</p>
          </div>
        `;
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  function render() {
    const route = getRoute();
    container.innerHTML = `
      <div class="rescue-widget rw-blog-wrap">
        <div id="rw-blog-authbar"></div>
        <div id="rw-blog-content"></div>
      </div>
    `;
    renderAuthBar();
    if (route.view === 'post') {
      renderPostDetail(route.id);
    } else {
      renderList();
    }
  }

  // ---------- auth bar ----------

  function renderAuthBar() {
    const bar = document.getElementById('rw-blog-authbar');

    if (currentUser) {
      const eligible = canPost(currentUser);
      bar.innerHTML = `
        <div class="rw-blog-authbar">
          <span style="display:flex; align-items:center; gap:0.5rem;">
            ${avatarHtml(currentUser.display_name, currentUser.avatar_url, 28)}
            Signed in as <strong>${escapeHtml(currentUser.display_name)}</strong>${roleBadgeHtml(currentUser.role)}
          </span>
          <div>
            ${eligible ? `<button class="rw-blog-link-btn" id="rw-new-post-btn">+ New post</button>` : ''}
            <button class="rw-blog-link-btn" id="rw-edit-profile-btn">Edit profile</button>
            <button class="rw-blog-link-btn" id="rw-logout-btn">Log out</button>
          </div>
        </div>
        ${eligible ? '' : '<p style="color:#6b6b6b; font-size:0.85rem; margin:-0.75rem 0 1.25rem;">Only Founders, Vice Presidents, and Website Developers can create new posts — but you can comment on any post below.</p>'}
        <div id="rw-profile-form-slot"></div>
        <div id="rw-composer-slot"></div>
      `;
      const newPostBtn = document.getElementById('rw-new-post-btn');
      if (newPostBtn) newPostBtn.addEventListener('click', toggleComposer);
      document.getElementById('rw-edit-profile-btn').addEventListener('click', toggleProfileForm);
      document.getElementById('rw-logout-btn').addEventListener('click', async () => {
        await authFetch(apiBase, '/api/users/logout', { method: 'POST' });
        currentUser = null;
        render();
      });
    } else {
      bar.innerHTML = `
        <div class="rw-blog-authbar">
          <span>Have something to share?</span>
          <div>
            <button class="rw-blog-link-btn" id="rw-show-login">Log in</button>
            <button class="rw-blog-link-btn" id="rw-show-signup">Sign up</button>
          </div>
        </div>
        <div id="rw-auth-form-slot"></div>
      `;
      document.getElementById('rw-show-login').addEventListener('click', () => toggleAuthForm('login'));
      document.getElementById('rw-show-signup').addEventListener('click', () => toggleAuthForm('signup'));
    }
  }

  function toggleAuthForm(mode) {
    const slot = document.getElementById('rw-auth-form-slot');
    if (slot.dataset.mode === mode) {
      slot.innerHTML = '';
      slot.removeAttribute('data-mode');
      return;
    }
    slot.dataset.mode = mode;

    if (mode === 'login') {
      slot.innerHTML = `
        <form id="rw-login-form" class="rw-blog-inline-form">
          <label>Username</label>
          <input name="username" required />
          <label>Password</label>
          <input name="password" type="password" required />
          <div class="rw-error" id="rw-login-error"></div>
          <button type="submit">Log in</button>
          <button type="button" class="rw-blog-link-btn" id="rw-forgot-password-btn" style="margin-left:0.5rem;">Forgot password?</button>
        </form>
        <div id="rw-forgot-password-slot"></div>
      `;
      const form = document.getElementById('rw-login-form');
      const errorEl = document.getElementById('rw-login-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          currentUser = await authFetch(apiBase, '/api/users/login', {
            method: 'POST',
            body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
          });
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });

      document.getElementById('rw-forgot-password-btn').addEventListener('click', () => {
        const fpSlot = document.getElementById('rw-forgot-password-slot');
        if (fpSlot.dataset.open === '1') {
          fpSlot.innerHTML = '';
          fpSlot.removeAttribute('data-open');
          return;
        }
        fpSlot.dataset.open = '1';
        fpSlot.innerHTML = `
          <form id="rw-forgot-form" class="rw-blog-inline-form">
            <label>Email</label>
            <input name="email" type="email" required placeholder="The email you signed up with" />
            <div class="rw-error" id="rw-forgot-error"></div>
            <button type="submit">Send reset link</button>
          </form>
        `;
        const forgotForm = document.getElementById('rw-forgot-form');
        const forgotError = document.getElementById('rw-forgot-error');
        forgotForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          forgotError.textContent = '';
          try {
            const result = await authFetch(apiBase, '/api/users/forgot-password', {
              method: 'POST',
              body: JSON.stringify({ email: forgotForm.email.value.trim() }),
            });
            fpSlot.innerHTML = `<p class="rw-success">${escapeHtml(result.message)}</p>`;
          } catch (err) {
            forgotError.textContent = err.message;
          }
        });
      });
    } else {
      slot.innerHTML = `
        <form id="rw-signup-form" class="rw-blog-inline-form">
          <label>Display name</label>
          <input name="display_name" required placeholder="Shown on your posts and comments" />
          <label>Username</label>
          <input name="username" required placeholder="3-30 characters, no spaces" />
          <label>Email</label>
          <input name="email" type="email" required placeholder="Used only for password resets" />
          <label>Password</label>
          <input name="password" type="password" required placeholder="At least 8 characters" />
          <div class="rw-error" id="rw-signup-error"></div>
          <button type="submit">Create account</button>
        </form>
      `;
      const form = document.getElementById('rw-signup-form');
      const errorEl = document.getElementById('rw-signup-error');
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
          render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    }
  }

  function toggleProfileForm() {
    const slot = document.getElementById('rw-profile-form-slot');
    if (slot.dataset.open === '1') {
      slot.innerHTML = '';
      slot.removeAttribute('data-open');
      return;
    }
    slot.dataset.open = '1';
    slot.innerHTML = `
      <form id="rw-profile-form" class="rw-blog-inline-form">
        <label>Display name</label>
        <input name="display_name" value="${escapeHtml(currentUser.display_name)}" required />
        <label>Email</label>
        <input name="email" type="email" value="${escapeHtml(currentUser.email || '')}" placeholder="Used only for password resets" required />
        <label>Profile picture URL (optional)</label>
        <input name="avatar_url" value="${escapeHtml(currentUser.avatar_url || '')}" placeholder="https://..." />
        <div class="rw-error" id="rw-profile-error"></div>
        <button type="submit">Save profile</button>
      </form>
    `;
    const form = document.getElementById('rw-profile-form');
    const errorEl = document.getElementById('rw-profile-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        currentUser = await authFetch(apiBase, '/api/users/me', {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: form.display_name.value.trim(),
            email: form.email.value.trim(),
            avatar_url: form.avatar_url.value.trim(),
          }),
        });
        render();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  function toggleComposer() {
    const slot = document.getElementById('rw-composer-slot');
    if (slot.dataset.open === '1') {
      slot.innerHTML = '';
      slot.removeAttribute('data-open');
      return;
    }
    slot.dataset.open = '1';
    slot.innerHTML = `
      <form id="rw-post-form" class="rw-blog-inline-form">
        <label>Title</label>
        <input name="title" required />
        <label>Post</label>
        <textarea name="body" rows="5" required></textarea>
        <div class="rw-error" id="rw-post-error"></div>
        <button type="submit">Publish</button>
      </form>
    `;
    const form = document.getElementById('rw-post-form');
    const errorEl = document.getElementById('rw-post-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        const post = await authFetch(apiBase, '/api/posts', {
          method: 'POST',
          body: JSON.stringify({ title: form.title.value.trim(), body: form.body.value.trim() }),
        });
        slot.innerHTML = '';
        slot.removeAttribute('data-open');
        window.location.hash = `post-${post.id}`;
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  // ---------- post list ----------

  async function renderList() {
    const content = document.getElementById('rw-blog-content');
    content.innerHTML = '<p>Loading posts…</p>';

    try {
      const posts = await authFetch(apiBase, '/api/posts');
      if (posts.length === 0) {
        content.innerHTML = '<p>No posts yet — be the first to share something!</p>';
        return;
      }

      content.innerHTML = posts.map((p) => `
        <div class="rw-blog-post-card">
          <a class="rw-blog-post-title" href="#post-${p.id}">${escapeHtml(p.title)}</a>
          <div class="rw-blog-post-meta" style="display:flex; align-items:center; gap:0.4rem;">
            ${avatarHtml(p.author_name, p.author_avatar, 20)}
            ${escapeHtml(p.author_name)}${roleBadgeHtml(p.author_role)} · ${fmtDate(p.created_at)} · ${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}
          </div>
          <p class="rw-blog-post-excerpt">${escapeHtml(p.excerpt)}</p>
          <a class="rw-blog-readmore" href="#post-${p.id}">Read more →</a>
        </div>
      `).join('');
    } catch (err) {
      content.innerHTML = `<p class="rw-error">Could not load posts right now.</p>`;
    }
  }

  // ---------- single post + comments ----------

  async function renderPostDetail(id) {
    const content = document.getElementById('rw-blog-content');
    content.innerHTML = '<p>Loading post…</p>';

    let post;
    try {
      post = await authFetch(apiBase, `/api/posts/${id}`);
    } catch (err) {
      content.innerHTML = `<p class="rw-error">Could not load that post — it may have been removed.</p><a href="#" class="rw-blog-readmore">← Back to all posts</a>`;
      return;
    }

    const isOwner = currentUser && currentUser.id === post.user_id;

    content.innerHTML = `
      <a href="#" class="rw-blog-back">← Back to all posts</a>
      <h3 class="rw-blog-post-title-full">${escapeHtml(post.title)}</h3>
      <div class="rw-blog-post-meta" style="display:flex; align-items:center; gap:0.4rem;">
        ${avatarHtml(post.author_name, post.author_avatar, 22)}
        ${escapeHtml(post.author_name)}${roleBadgeHtml(post.author_role)} · ${fmtDate(post.created_at)}
      </div>
      <div class="rw-blog-post-body">${escapeHtml(post.body)}</div>
      ${isOwner ? `<button class="rw-blog-link-btn rw-blog-danger" id="rw-delete-post">Delete this post</button>` : ''}

      <div class="rw-blog-comments">
        <h4>Comments (${post.comments.length})</h4>
        ${post.comments.map((c) => `
          <div class="rw-blog-comment">
            <div class="rw-blog-comment-meta" style="display:flex; align-items:center; gap:0.4rem;">
              ${avatarHtml(c.author_name, c.author_avatar, 18)}
              <strong>${escapeHtml(c.author_name)}</strong>${roleBadgeHtml(c.author_role)} · ${fmtDate(c.created_at)}
            </div>
            <div>${escapeHtml(c.body)}</div>
            ${currentUser && currentUser.id === c.user_id ? `<button class="rw-blog-link-btn rw-blog-danger" data-delete-comment="${c.id}">Delete</button>` : ''}
          </div>
        `).join('') || '<p style="color:#6b6b6b; font-size:0.9rem;">No comments yet.</p>'}

        ${currentUser ? `
          <form id="rw-comment-form" class="rw-blog-inline-form">
            <textarea name="body" rows="3" placeholder="Add a comment…" required></textarea>
            <div class="rw-error" id="rw-comment-error"></div>
            <button type="submit">Comment</button>
          </form>
        ` : `<p style="color:#6b6b6b; font-size:0.9rem;">Log in above to leave a comment.</p>`}
      </div>
    `;

    content.querySelector('.rw-blog-back').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '';
    });

    if (isOwner) {
      document.getElementById('rw-delete-post').addEventListener('click', async () => {
        if (!confirm('Delete this post permanently?')) return;
        try {
          await authFetch(apiBase, `/api/posts/${id}`, { method: 'DELETE' });
          window.location.hash = '';
        } catch (err) {
          alert(err.message);
        }
      });
    }

    content.querySelectorAll('[data-delete-comment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this comment permanently?')) return;
        try {
          await authFetch(apiBase, `/api/comments/${btn.dataset.deleteComment}`, { method: 'DELETE' });
          renderPostDetail(id);
        } catch (err) {
          alert(err.message);
        }
      });
    });

    const commentForm = document.getElementById('rw-comment-form');
    if (commentForm) {
      const errorEl = document.getElementById('rw-comment-error');
      commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        try {
          await authFetch(apiBase, `/api/posts/${id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: commentForm.body.value.trim() }),
          });
          renderPostDetail(id);
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    }
  }

  boot();
})();
