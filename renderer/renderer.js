// Harf Translator — renderer process
// UI-only foundation: plain client-side view switching + small cosmetic
// interactions. No backend, no file I/O, no real translation logic.

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Sidebar navigation: show/hide sections
   * ------------------------------------------------------------------ */

  var navItems = document.querySelectorAll('.nav-item');
  var views = document.querySelectorAll('.view');

  function showSection(target) {
    navItems.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.target === target);
    });
    views.forEach(function (view) {
      view.classList.toggle('is-active', view.id === 'view-' + target);
    });
  }

  navItems.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showSection(btn.dataset.target);
    });
  });

  // "View all" style links inside a section that jump to another section.
  document.querySelectorAll('[data-goto]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showSection(btn.dataset.goto);
    });
  });

  /* ------------------------------------------------------------------ *
   * Progress bars: widths come from a data attribute, not an inline
   * style="" attribute, so the page's CSP can drop style-src
   * 'unsafe-inline' entirely (this is a script-driven CSSOM write, which
   * CSP's style-src does not govern).
   * ------------------------------------------------------------------ */

  document.querySelectorAll('.progress-fill[data-progress]').forEach(function (bar) {
    var pct = Math.max(0, Math.min(100, parseFloat(bar.dataset.progress) || 0));
    bar.style.width = pct + '%';
  });

  /* ------------------------------------------------------------------ *
   * Translation requests: toggle the "new request" placeholder form
   * ------------------------------------------------------------------ */

  var toggleBtn = document.getElementById('toggle-request-form');
  var requestForm = document.getElementById('request-form');
  var cancelBtn = document.getElementById('cancel-request-form');
  var formNote = document.getElementById('form-note');
  var formError = document.getElementById('form-error');

  function resetRequestFormFeedback() {
    formNote.hidden = true;
    formError.hidden = true;
    requestForm.querySelectorAll('.field.is-invalid').forEach(function (field) {
      field.classList.remove('is-invalid');
    });
  }

  if (toggleBtn && requestForm) {
    toggleBtn.addEventListener('click', function () {
      requestForm.hidden = !requestForm.hidden;
      if (!requestForm.hidden) {
        resetRequestFormFeedback();
        requestForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (cancelBtn && requestForm) {
    cancelBtn.addEventListener('click', function () {
      requestForm.hidden = true;
      requestForm.reset();
      resetRequestFormFeedback();
    });
  }

  if (requestForm) {
    // Anyone can submit a request — no login required — but every field
    // marked required (currently just the game name; engine/link stay
    // optional, like the "(لو تعرفون)" fields on the public site) must
    // actually be filled before it goes through.
    requestForm.querySelectorAll('[required]').forEach(function (control) {
      control.addEventListener('input', function () {
        var field = control.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    });

    requestForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var missing = [];
      var firstInvalid = null;
      requestForm.querySelectorAll('[required]').forEach(function (control) {
        var field = control.closest('.field');
        var isEmpty = !control.value.trim();
        if (field) field.classList.toggle('is-invalid', isEmpty);
        if (isEmpty) {
          missing.push((field && field.dataset.field) || 'حقل مطلوب');
          if (!firstInvalid) firstInvalid = control;
        }
      });

      if (missing.length) {
        formNote.hidden = true;
        formError.textContent = 'الرجاء تعبئة الحقول التالية قبل الإرسال: ' + missing.join('، ');
        formError.hidden = false;
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      formError.hidden = true;
      // Placeholder only — nothing is persisted or sent anywhere yet.
      formNote.hidden = false;
    });
  }

  /* ------------------------------------------------------------------ *
   * Translated games: fake "preparing download" confirmation
   * ------------------------------------------------------------------ */

  document.querySelectorAll('.btn-download').forEach(function (btn) {
    var note = btn.parentElement.querySelector('.download-note');
    if (!note) return;
    btn.addEventListener('click', function () {
      note.hidden = false;
      window.clearTimeout(btn._noteTimer);
      btn._noteTimer = window.setTimeout(function () {
        note.hidden = true;
      }, 3000);
    });
  });

  /* ------------------------------------------------------------------ *
   * Theme: light/dark toggle, persisted to localStorage
   * ------------------------------------------------------------------ */

  var THEME_KEY = 'harf-theme';
  var themeRadios = document.querySelectorAll('input[name="theme"]');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // localStorage unavailable — the choice just won't survive a restart.
    }
  }

  // theme-init.js (in <head>) may already have applied a persisted dark
  // theme before this script ran. Sync the settings radios to match
  // whatever is actually active right now, rather than trusting the
  // "checked" attribute baked into the HTML.
  var activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  themeRadios.forEach(function (radio) {
    radio.checked = radio.value === activeTheme;
  });

  themeRadios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!radio.checked) return;
      applyTheme(radio.value);
      storeTheme(radio.value);
    });
  });

  /* ------------------------------------------------------------------ *
   * Auth: UI-only mock login/logout. No real backend, no real accounts —
   * "logging in" just flips a localStorage flag and a display name, and
   * is only here to gate two specific actions (posting a comment, and the
   * join-the-team CTA). The translation-request form stays open to
   * everyone, logged in or not.
   * ------------------------------------------------------------------ */

  var AUTH_KEY = 'harf-auth-user';

  function getAuthUser() {
    try {
      return window.localStorage.getItem(AUTH_KEY);
    } catch (e) {
      return null;
    }
  }

  function setAuthUser(name) {
    try {
      if (name) {
        window.localStorage.setItem(AUTH_KEY, name);
      } else {
        window.localStorage.removeItem(AUTH_KEY);
      }
    } catch (e) {
      // localStorage unavailable — the session just won't survive a restart.
    }
  }

  var guestAuthBtn = document.getElementById('guest-auth-btn');
  var userChip = document.getElementById('user-chip');
  var userChipName = document.getElementById('user-chip-name');
  var userChipAvatar = document.getElementById('user-chip-avatar');
  var logoutBtn = document.getElementById('logout-btn');

  var loginOverlay = document.getElementById('login-overlay');
  var loginForm = document.getElementById('login-form');
  var loginEmail = document.getElementById('login-email');
  var loginLede = document.getElementById('login-lede');
  var loginCancelBtn = document.getElementById('login-cancel');
  var loginCloseBtn = document.getElementById('login-close');

  var pendingAction = null;

  function renderAuthUI() {
    var name = getAuthUser();
    if (name) {
      if (guestAuthBtn) guestAuthBtn.hidden = true;
      if (userChip) userChip.hidden = false;
      if (userChipName) userChipName.textContent = name;
      if (userChipAvatar) userChipAvatar.textContent = name.trim().charAt(0) || 'ح';
    } else {
      if (guestAuthBtn) guestAuthBtn.hidden = false;
      if (userChip) userChip.hidden = true;
    }
  }

  function openLoginModal(reason) {
    if (!loginOverlay) return;
    if (loginLede) loginLede.textContent = reason || 'سجّل الدخول لإكمال هذا الإجراء.';
    loginOverlay.hidden = false;
    if (loginEmail) loginEmail.focus();
  }

  function closeLoginModal() {
    if (!loginOverlay) return;
    loginOverlay.hidden = true;
    if (loginForm) loginForm.reset();
  }

  // Runs `action` right away if already logged in; otherwise prompts for a
  // (mock) login first and runs it automatically right after sign-in.
  function requireAuth(action, reason) {
    if (getAuthUser()) {
      action();
    } else {
      pendingAction = action;
      openLoginModal(reason);
    }
  }

  if (guestAuthBtn) {
    guestAuthBtn.addEventListener('click', function () {
      openLoginModal();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      setAuthUser(null);
      renderAuthUI();
    });
  }

  if (loginCancelBtn) {
    loginCancelBtn.addEventListener('click', function () {
      pendingAction = null;
      closeLoginModal();
    });
  }
  if (loginCloseBtn) {
    loginCloseBtn.addEventListener('click', function () {
      pendingAction = null;
      closeLoginModal();
    });
  }
  if (loginOverlay) {
    loginOverlay.addEventListener('click', function (e) {
      if (e.target === loginOverlay) {
        pendingAction = null;
        closeLoginModal();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !loginOverlay.hidden) {
        pendingAction = null;
        closeLoginModal();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      // Mock login: any email/password (or none at all) succeeds. Derive a
      // display name from the email's local part when one was typed,
      // otherwise fall back to the placeholder profile already shown in
      // Settings — this is the same single local "you" throughout the app.
      var emailVal = loginEmail ? loginEmail.value.trim() : '';
      var name = emailVal ? emailVal.split('@')[0] : 'سارة كمال';
      setAuthUser(name);
      renderAuthUI();
      closeLoginModal();
      var action = pendingAction;
      pendingAction = null;
      if (action) action();
    });
  }

  renderAuthUI();

  /* ------------------------------------------------------------------ *
   * Dashboard comments: posting a new one is gated behind login (reading
   * the existing list never was).
   * ------------------------------------------------------------------ */

  var commentForm = document.getElementById('comment-form');
  var commentInput = document.getElementById('comment-input');
  var commentList = document.getElementById('comment-list');

  function postComment(text, authorName) {
    if (!commentList) return;
    var li = document.createElement('li');

    var avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.textContent = authorName.trim().charAt(0) || 'ح';

    var wrap = document.createElement('div');
    var p = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = authorName;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(' ' + text));

    var time = document.createElement('p');
    time.className = 'muted small';
    time.textContent = 'الآن';

    wrap.appendChild(p);
    wrap.appendChild(time);
    li.appendChild(avatar);
    li.appendChild(wrap);

    commentList.insertBefore(li, commentList.firstChild);
  }

  if (commentForm && commentInput) {
    commentForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = commentInput.value.trim();
      if (!text) return;
      requireAuth(function () {
        postComment(text, getAuthUser() || 'سارة كمال');
        commentInput.value = '';
      }, 'سجّل الدخول لنشر تعليق.');
    });
  }

  /* ------------------------------------------------------------------ *
   * "قدم طلبك" join-the-team CTA: also gated behind login. The
   * translation-request form ("+ طلب جديد") is deliberately NOT gated —
   * anyone can submit one, per the client's instruction.
   * ------------------------------------------------------------------ */

  var joinBtn = document.getElementById('join-team-btn');
  var joinNote = document.getElementById('join-team-note');

  if (joinBtn) {
    joinBtn.addEventListener('click', function () {
      requireAuth(function () {
        if (!joinNote) return;
        joinNote.hidden = false;
        window.clearTimeout(joinBtn._noteTimer);
        joinBtn._noteTimer = window.setTimeout(function () {
          joinNote.hidden = true;
        }, 4000);
      }, 'سجّل الدخول لتقديم طلب الانضمام.');
    });
  }

  /* ------------------------------------------------------------------ *
   * Settings: fake "saved" confirmation (nothing is persisted yet)
   * ------------------------------------------------------------------ */

  var settingsForm = document.getElementById('settings-form');
  var settingsNote = document.getElementById('settings-note');

  if (settingsForm && settingsNote) {
    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      settingsNote.hidden = false;
      window.clearTimeout(settingsForm._noteTimer);
      settingsForm._noteTimer = window.setTimeout(function () {
        settingsNote.hidden = true;
      }, 3000);
    });
  }
})();
