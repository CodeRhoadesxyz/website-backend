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

  function fmtDate(iso) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

    try {
      currentUser = await authFetch(apiBase, '/api/users/me');
    } catch (err) {
      currentUser = null; // not signed in — completely normal, not an error state
    }

    render();
    window.addEventListener('hashchange', render);
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
      bar.innerHTML = `
        <div class="rw-blog-authbar">
          <span>Signed in as <strong>${escapeHtml(currentUser.display_name)}</strong></span>
          <div>
            <button class="rw-blog-link-btn" id="rw-new-post-btn">+ New post</button>
            <button class="rw-blog-link-btn" id="rw-logout-btn">Log out</button>
          </div>
        </div>
        <div id="rw-composer-slot"></div>
      `;
      document.getElementById('rw-new-post-btn').addEventListener('click', toggleComposer);
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
        </form>
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
    } else {
      slot.innerHTML = `
        <form id="rw-signup-form" class="rw-blog-inline-form">
          <label>Display name</label>
          <input name="display_name" required placeholder="Shown on your posts and comments" />
          <label>Username</label>
          <input name="username" required placeholder="3-30 characters, no spaces" />
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
          <div class="rw-blog-post-meta">${escapeHtml(p.author_name)} · ${fmtDate(p.created_at)} · ${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}</div>
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
      <div class="rw-blog-post-meta">${escapeHtml(post.author_name)} · ${fmtDate(post.created_at)}</div>
      <div class="rw-blog-post-body">${escapeHtml(post.body)}</div>
      ${isOwner ? `<button class="rw-blog-link-btn rw-blog-danger" id="rw-delete-post">Delete this post</button>` : ''}

      <div class="rw-blog-comments">
        <h4>Comments (${post.comments.length})</h4>
        ${post.comments.map((c) => `
          <div class="rw-blog-comment">
            <div class="rw-blog-comment-meta"><strong>${escapeHtml(c.author_name)}</strong> · ${fmtDate(c.created_at)}</div>
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
