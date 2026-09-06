// Harf Translator — renderer process
// Client-side view switching plus small cosmetic interactions, and now real
// data: comments, translation requests, and join-the-team applications are
// read from and written to Supabase (see supabase.js) instead of being
// hardcoded mock content. Still no file I/O and no real translation logic.
// Auth stays a UI-only mock — see the Auth section below and SECURITY.md.

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
   * Translation requests: toggle the "new request" form, submit it to
   * Supabase, and render the real request list fetched from there too.
   * ------------------------------------------------------------------ */

  var toggleBtn = document.getElementById('toggle-request-form');
  var requestForm = document.getElementById('request-form');
  var cancelBtn = document.getElementById('cancel-request-form');
  var formNote = document.getElementById('form-note');
  var formError = document.getElementById('form-error');
  var reqGameNameInput = document.getElementById('req-game-name');
  var reqEngineInput = document.getElementById('req-engine');
  var reqGameLinkInput = document.getElementById('req-game-link');
  var reqNotesInput = document.getElementById('req-notes');
  var reqRowsEl = document.getElementById('req-rows');
  var reqListError = document.getElementById('req-list-error');

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

  // Status text (as stored in the `status` column) mapped to a pill color.
  // New requests always arrive as 'قيد الدراسة' (the column default) —
  // the other values only ever appear once the team updates a row from
  // the Supabase dashboard, which this app has no UI for yet.
  function statusPillClass(status) {
    if (status === 'مقبول') return 'pill-good';
    if (status === 'مرفوض') return 'pill-bad';
    if (status === 'قيد الدراسة') return 'pill-mid';
    return 'pill-neutral';
  }

  function formatDateOnly(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  // Builds one .req-row from a translation_requests table row. Every value
  // here can be arbitrary text typed by an anonymous visitor, so it's
  // assigned via textContent (never innerHTML) to avoid injecting markup.
  function buildRequestRow(reqRow) {
    var row = document.createElement('div');
    row.className = 'req-row';

    var gameSpan = document.createElement('span');
    gameSpan.className = 'req-game';
    gameSpan.textContent = reqRow.game_name || '';
    row.appendChild(gameSpan);

    var engineSpan = document.createElement('span');
    engineSpan.textContent = reqRow.engine || '—';
    row.appendChild(engineSpan);

    var statusWrap = document.createElement('span');
    var pill = document.createElement('span');
    pill.className = 'pill ' + statusPillClass(reqRow.status);
    pill.textContent = reqRow.status || 'قيد الدراسة';
    statusWrap.appendChild(pill);
    row.appendChild(statusWrap);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(reqRow.created_at);
    row.appendChild(dateSpan);

    return row;
  }

  function renderRequests(list) {
    if (!reqRowsEl) return;
    reqRowsEl.innerHTML = '';
    if (!list || !list.length) {
      var empty = document.createElement('div');
      empty.className = 'req-empty';
      empty.textContent = 'لا توجد طلبات بعد';
      reqRowsEl.appendChild(empty);
      return;
    }
    list.forEach(function (reqRow) {
      reqRowsEl.appendChild(buildRequestRow(reqRow));
    });
  }

  function prependRequestRow(reqRow) {
    if (!reqRowsEl) return;
    var emptyNotice = reqRowsEl.querySelector('.req-empty');
    if (emptyNotice) emptyNotice.remove();
    reqRowsEl.insertBefore(buildRequestRow(reqRow), reqRowsEl.firstChild);
  }

  function loadRequests() {
    if (!window.HarfSupabase || !reqRowsEl) return;
    window.HarfSupabase.listTranslationRequests().then(function (rows) {
      if (reqListError) reqListError.hidden = true;
      renderRequests(rows);
    }).catch(function () {
      reqRowsEl.innerHTML = '';
      if (reqListError) {
        reqListError.textContent = 'تعذّر تحميل طلبات الترجمة، تحقق من الاتصال وحاول مرة أخرى.';
        reqListError.hidden = false;
      }
    });
  }

  function submitTranslationRequest() {
    if (!window.HarfSupabase) return;
    var submitBtn = requestForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var payload = {
      game_name: reqGameNameInput.value.trim(),
      engine: (reqEngineInput && reqEngineInput.value.trim()) || null,
      game_link: (reqGameLinkInput && reqGameLinkInput.value.trim()) || null,
      notes: (reqNotesInput && reqNotesInput.value.trim()) || null
    };

    window.HarfSupabase.createTranslationRequest(payload).then(function (rows) {
      var row = rows && rows[0];
      if (row) prependRequestRow(row);
      requestForm.reset();
      resetRequestFormFeedback();
      formNote.hidden = false;
    }).catch(function () {
      formNote.hidden = true;
      formError.textContent = 'تعذّر إرسال الطلب، تحقق من الاتصال وحاول مرة أخرى.';
      formError.hidden = false;
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
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
      submitTranslationRequest();
    });
  }

  loadRequests();

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
  var AUTH_EMAIL_KEY = 'harf-auth-email';

  function getAuthUser() {
    try {
      return window.localStorage.getItem(AUTH_KEY);
    } catch (e) {
      return null;
    }
  }

  function getAuthEmail() {
    try {
      return window.localStorage.getItem(AUTH_EMAIL_KEY);
    } catch (e) {
      return null;
    }
  }

  // `email` is the actual string typed into the mock login form (kept
  // alongside the derived display name so Settings → الملف الشخصي can show
  // a real name + real email instead of fabricated ones — still no real
  // verification of it happens anywhere, see SECURITY.md).
  function setAuthUser(name, email) {
    try {
      if (name) {
        window.localStorage.setItem(AUTH_KEY, name);
      } else {
        window.localStorage.removeItem(AUTH_KEY);
      }
      if (email) {
        window.localStorage.setItem(AUTH_EMAIL_KEY, email);
      } else {
        window.localStorage.removeItem(AUTH_EMAIL_KEY);
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
    renderProfilePanel();
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
      setAuthUser(null, null);
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
      setAuthUser(name, emailVal || null);
      renderAuthUI();
      closeLoginModal();
      var action = pendingAction;
      pendingAction = null;
      if (action) action();
    });
  }

  /* ------------------------------------------------------------------ *
   * Settings → الملف الشخصي: gated behind the same mock login as comments
   * and the join-team CTA. With no user logged in, the panel is hidden
   * entirely and a small prompt is shown instead; once logged in, it shows
   * the real typed-in name/email captured above (still self-reported, not
   * verified — see SECURITY.md — but no longer fabricated placeholder data).
   * ------------------------------------------------------------------ */

  var profilePanel = document.getElementById('profile-panel');
  var profileGate = document.getElementById('profile-gate');
  var profileNameInput = document.getElementById('profile-name-input');
  var profileEmailInput = document.getElementById('profile-email-input');
  var profileLoginBtn = document.getElementById('profile-login-btn');

  function renderProfilePanel() {
    var name = getAuthUser();
    if (name) {
      if (profileGate) profileGate.hidden = true;
      if (profilePanel) profilePanel.hidden = false;
      if (profileNameInput) profileNameInput.value = name;
      if (profileEmailInput) profileEmailInput.value = getAuthEmail() || '—';
    } else {
      if (profilePanel) profilePanel.hidden = true;
      if (profileGate) profileGate.hidden = false;
    }
  }

  if (profileLoginBtn) {
    profileLoginBtn.addEventListener('click', function () {
      openLoginModal('سجّل الدخول لعرض ملفك الشخصي.');
    });
  }

  renderAuthUI();

  /* ------------------------------------------------------------------ *
   * Dashboard comments: fetched from Supabase on load; posting a new one
   * is gated behind login (reading the existing list never was) and POSTs
   * to Supabase using the logged-in mock display name as author_name.
   * ------------------------------------------------------------------ */

  var commentForm = document.getElementById('comment-form');
  var commentInput = document.getElementById('comment-input');
  var commentList = document.getElementById('comment-list');
  var commentErrorEl = document.getElementById('comment-error');

  function setCommentError(message) {
    if (!commentErrorEl) return;
    commentErrorEl.textContent = message;
    commentErrorEl.hidden = false;
  }

  function clearCommentError() {
    if (commentErrorEl) commentErrorEl.hidden = true;
  }

  // Builds one <li> for the comment list. author_name/body are arbitrary
  // text submitted by anonymous visitors, so this is built with DOM APIs
  // (textContent) rather than innerHTML to avoid injecting markup.
  function buildCommentItem(authorName, body, createdAt) {
    var li = document.createElement('li');

    var avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.textContent = (authorName || 'ح').trim().charAt(0) || 'ح';

    var wrap = document.createElement('div');
    var p = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = authorName || 'مستخدم';
    p.appendChild(strong);
    p.appendChild(document.createTextNode(' ' + body));

    var time = document.createElement('p');
    time.className = 'muted small';
    time.textContent = formatRelativeTime(createdAt);

    wrap.appendChild(p);
    wrap.appendChild(time);
    li.appendChild(avatar);
    li.appendChild(wrap);
    return li;
  }

  // Small Arabic relative-timestamp formatter (dual/plural-aware for the
  // common small counts) — no date library is available given the CSP.
  function formatRelativeTime(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var diffMs = Math.max(0, Date.now() - then);
    var minute = 60000, hour = 3600000, day = 86400000;

    if (diffMs < minute) return 'الآن';

    if (diffMs < hour) {
      var mins = Math.max(1, Math.round(diffMs / minute));
      if (mins === 2) return 'قبل دقيقتين';
      return 'قبل ' + mins + ' ' + (mins <= 10 ? 'دقائق' : 'دقيقة');
    }

    if (diffMs < day) {
      var hrs = Math.round(diffMs / hour);
      if (hrs === 1) return 'قبل ساعة';
      if (hrs === 2) return 'قبل ساعتين';
      return 'قبل ' + hrs + ' ' + (hrs <= 10 ? 'ساعات' : 'ساعة');
    }

    var days = Math.round(diffMs / day);
    if (days === 1) return 'أمس';
    if (days === 2) return 'منذ يومين';
    if (days <= 10) return 'منذ ' + days + ' أيام';
    if (days <= 30) return 'منذ ' + days + ' يومًا';

    return new Date(iso).toISOString().slice(0, 10);
  }

  function renderComments(list) {
    if (!commentList) return;
    commentList.innerHTML = '';
    if (!list || !list.length) {
      var empty = document.createElement('li');
      empty.className = 'comment-empty';
      empty.textContent = 'لا توجد تعليقات بعد — كن أول من يعلّق!';
      commentList.appendChild(empty);
      return;
    }
    list.forEach(function (comment) {
      commentList.appendChild(buildCommentItem(comment.author_name, comment.body, comment.created_at));
    });
  }

  function loadComments() {
    if (!window.HarfSupabase || !commentList) return;
    window.HarfSupabase.listComments().then(function (rows) {
      clearCommentError();
      renderComments(rows);
    }).catch(function () {
      commentList.innerHTML = '';
      setCommentError('تعذّر تحميل التعليقات، تحقق من الاتصال وحاول مرة أخرى.');
    });
  }

  function submitComment(text, authorName) {
    if (!window.HarfSupabase) return;
    clearCommentError();
    var submitBtn = commentForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    window.HarfSupabase.createComment(authorName, text).then(function (rows) {
      var row = rows && rows[0];
      var createdAt = row ? row.created_at : new Date().toISOString();
      if (commentList) {
        var emptyNotice = commentList.querySelector('.comment-empty');
        if (emptyNotice) emptyNotice.remove();
        commentList.insertBefore(buildCommentItem(authorName, text, createdAt), commentList.firstChild);
      }
      commentInput.value = '';
    }).catch(function () {
      setCommentError('تعذّر نشر التعليق، حاول مرة أخرى.');
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  if (commentForm && commentInput) {
    commentForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = commentInput.value.trim();
      if (!text) return;
      requireAuth(function () {
        submitComment(text, getAuthUser() || 'سارة كمال');
      }, 'سجّل الدخول لنشر تعليق.');
    });
  }

  loadComments();

  /* ------------------------------------------------------------------ *
   * "قدم طلبك" join-the-team CTA: gated behind login, same as posting a
   * comment. Opens a small modal (name/email/optional message), POSTs to
   * the insert-only join_applications table, and never reads it back —
   * there is no SELECT policy for anon on that table by design; it's
   * private to the team. The translation-request form ("+ طلب جديد") is
   * deliberately NOT gated — anyone can submit one, per the client's
   * instruction.
   * ------------------------------------------------------------------ */

  var joinBtn = document.getElementById('join-team-btn');
  var joinNote = document.getElementById('join-team-note');
  var joinOverlay = document.getElementById('join-overlay');
  var joinForm = document.getElementById('join-form');
  var joinNameInput = document.getElementById('join-name');
  var joinEmailInput = document.getElementById('join-email');
  var joinMessageInput = document.getElementById('join-message');
  var joinFormError = document.getElementById('join-form-error');
  var joinCancelBtn = document.getElementById('join-cancel');
  var joinCloseBtn = document.getElementById('join-close');

  function resetJoinFormFeedback() {
    if (joinFormError) joinFormError.hidden = true;
    if (joinForm) {
      joinForm.querySelectorAll('.field.is-invalid').forEach(function (field) {
        field.classList.remove('is-invalid');
      });
    }
  }

  function openJoinModal() {
    if (!joinOverlay) return;
    resetJoinFormFeedback();
    joinOverlay.hidden = false;
    if (joinNameInput) joinNameInput.focus();
  }

  function closeJoinModal() {
    if (!joinOverlay) return;
    joinOverlay.hidden = true;
    if (joinForm) joinForm.reset();
    resetJoinFormFeedback();
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', function () {
      requireAuth(function () {
        openJoinModal();
      }, 'سجّل الدخول لتقديم طلب الانضمام.');
    });
  }

  if (joinCancelBtn) joinCancelBtn.addEventListener('click', closeJoinModal);
  if (joinCloseBtn) joinCloseBtn.addEventListener('click', closeJoinModal);
  if (joinOverlay) {
    joinOverlay.addEventListener('click', function (e) {
      if (e.target === joinOverlay) closeJoinModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !joinOverlay.hidden) closeJoinModal();
    });
  }

  function submitJoinApplication() {
    if (!window.HarfSupabase) return;
    var submitBtn = joinForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var payload = {
      name: joinNameInput.value.trim(),
      email: joinEmailInput.value.trim(),
      message: (joinMessageInput && joinMessageInput.value.trim()) || null
    };

    window.HarfSupabase.createJoinApplication(payload).then(function () {
      closeJoinModal();
      if (joinNote) {
        joinNote.hidden = false;
        window.clearTimeout(joinBtn._noteTimer);
        joinBtn._noteTimer = window.setTimeout(function () {
          joinNote.hidden = true;
        }, 4000);
      }
    }).catch(function () {
      if (joinFormError) {
        joinFormError.textContent = 'تعذّر إرسال طلبك، تحقق من الاتصال وحاول مرة أخرى.';
        joinFormError.hidden = false;
      }
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  if (joinForm) {
    joinForm.querySelectorAll('[required]').forEach(function (control) {
      control.addEventListener('input', function () {
        var field = control.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    });

    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var missing = [];
      var firstInvalid = null;
      joinForm.querySelectorAll('[required]').forEach(function (control) {
        var field = control.closest('.field');
        var isEmpty = !control.value.trim();
        if (field) field.classList.toggle('is-invalid', isEmpty);
        if (isEmpty) {
          missing.push((field && field.dataset.field) || 'حقل مطلوب');
          if (!firstInvalid) firstInvalid = control;
        }
      });

      if (missing.length) {
        joinFormError.textContent = 'الرجاء تعبئة الحقول التالية قبل الإرسال: ' + missing.join('، ');
        joinFormError.hidden = false;
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      joinFormError.hidden = true;
      submitJoinApplication();
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

  /* ------------------------------------------------------------------ *
   * Admin: real Supabase Auth sign-in (see HarfAdmin in supabase.js),
   * completely separate from the mock login above. Invisible/inert to
   * regular users until someone deliberately opens "دخول المدير" in the
   * sidebar footer and signs in with the founder's real Supabase account.
   * On success this reveals the "لوحة الإدارة" nav item and the admin
   * dashboard view; on load, a stored (and, if needed, silently
   * refreshed) session restores that same state without a fresh login.
   * ------------------------------------------------------------------ */

  var navAdminItem = document.getElementById('nav-admin-item');
  var sidebarAdminGuest = document.getElementById('sidebar-admin-guest');
  var sidebarAdminActive = document.getElementById('sidebar-admin-active');
  var adminEntryBtn = document.getElementById('admin-entry-btn');
  var adminSignoutBtn = document.getElementById('admin-signout-btn');

  var adminLoginOverlay = document.getElementById('admin-login-overlay');
  var adminLoginForm = document.getElementById('admin-login-form');
  var adminLoginEmail = document.getElementById('admin-login-email');
  var adminLoginPassword = document.getElementById('admin-login-password');
  var adminLoginError = document.getElementById('admin-login-error');
  var adminLoginSubmit = document.getElementById('admin-login-submit');
  var adminLoginCancelBtn = document.getElementById('admin-login-cancel');
  var adminLoginCloseBtn = document.getElementById('admin-login-close');

  function renderAdminAuthUI(signedIn) {
    if (navAdminItem) navAdminItem.hidden = !signedIn;
    if (sidebarAdminGuest) sidebarAdminGuest.hidden = signedIn;
    if (sidebarAdminActive) sidebarAdminActive.hidden = !signedIn;
    if (!signedIn && navAdminItem && navAdminItem.classList.contains('is-active')) {
      // The admin view was open when the session ended — fall back to the
      // regular dashboard rather than leaving an inert admin nav active.
      showSection('dashboard');
    }
  }

  function openAdminLoginModal() {
    if (!adminLoginOverlay) return;
    if (adminLoginError) adminLoginError.hidden = true;
    adminLoginOverlay.hidden = false;
    if (adminLoginEmail) adminLoginEmail.focus();
  }

  function closeAdminLoginModal() {
    if (!adminLoginOverlay) return;
    adminLoginOverlay.hidden = true;
    if (adminLoginForm) adminLoginForm.reset();
    if (adminLoginError) adminLoginError.hidden = true;
  }

  if (adminEntryBtn) {
    adminEntryBtn.addEventListener('click', openAdminLoginModal);
  }
  if (adminLoginCancelBtn) adminLoginCancelBtn.addEventListener('click', closeAdminLoginModal);
  if (adminLoginCloseBtn) adminLoginCloseBtn.addEventListener('click', closeAdminLoginModal);
  if (adminLoginOverlay) {
    adminLoginOverlay.addEventListener('click', function (e) {
      if (e.target === adminLoginOverlay) closeAdminLoginModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !adminLoginOverlay.hidden) closeAdminLoginModal();
    });
  }

  if (adminSignoutBtn) {
    adminSignoutBtn.addEventListener('click', function () {
      if (!window.HarfAdmin) return;
      adminSignoutBtn.disabled = true;
      window.HarfAdmin.signOut().finally(function () {
        adminSignoutBtn.disabled = false;
        renderAdminAuthUI(false);
      });
    });
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!window.HarfAdmin) return;
      if (adminLoginError) adminLoginError.hidden = true;
      var email = adminLoginEmail ? adminLoginEmail.value.trim() : '';
      var password = adminLoginPassword ? adminLoginPassword.value : '';
      if (!email || !password) {
        if (adminLoginError) {
          adminLoginError.textContent = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.';
          adminLoginError.hidden = false;
        }
        return;
      }
      if (adminLoginSubmit) {
        adminLoginSubmit.disabled = true;
        adminLoginSubmit.textContent = 'جارٍ الدخول...';
      }
      window.HarfAdmin.signIn(email, password).then(function () {
        closeAdminLoginModal();
        renderAdminAuthUI(true);
        loadAdminData();
        showSection('admin');
      }).catch(function () {
        if (adminLoginError) {
          adminLoginError.textContent = 'بيانات الدخول غير صحيحة';
          adminLoginError.hidden = false;
        }
      }).finally(function () {
        if (adminLoginSubmit) {
          adminLoginSubmit.disabled = false;
          adminLoginSubmit.textContent = 'دخول';
        }
      });
    });
  }

  // Restore an existing admin session on launch, refreshing it first if
  // the access token has expired — no fresh login needed unless the
  // refresh token itself is gone or invalid.
  if (window.HarfAdmin && window.HarfAdmin.hasSession()) {
    window.HarfAdmin.ensureValidSession().then(function () {
      renderAdminAuthUI(true);
      loadAdminData();
    }).catch(function () {
      renderAdminAuthUI(false);
    });
  } else {
    renderAdminAuthUI(false);
  }

  /* ------------------------------------------------------------------ *
   * Admin dashboard: three sub-tabs (طلبات الترجمة / التعليقات /
   * طلبات الانضمام), each backed by an authenticated PostgREST call using
   * the admin's access token (see HarfAdmin's list/updateStatus/deleteRow
   * in supabase.js) instead of the anon key. join_applications is never
   * read anywhere else in this app — this is the one and only place its
   * rows are ever displayed.
   * ------------------------------------------------------------------ */

  var adminTabs = document.querySelectorAll('.admin-tab');
  var adminPanels = {
    requests: document.getElementById('admin-panel-requests'),
    comments: document.getElementById('admin-panel-comments'),
    applications: document.getElementById('admin-panel-applications')
  };
  var adminRowsEl = {
    requests: document.getElementById('admin-requests-rows'),
    comments: document.getElementById('admin-comments-rows'),
    applications: document.getElementById('admin-applications-rows')
  };
  var adminErrorEl = document.getElementById('admin-error');

  adminTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.adminTab;
      adminTabs.forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
      });
      Object.keys(adminPanels).forEach(function (key) {
        if (adminPanels[key]) adminPanels[key].classList.toggle('is-active', key === target);
      });
    });
  });

  function setAdminError(message) {
    if (!adminErrorEl) return;
    if (message) {
      adminErrorEl.textContent = message;
      adminErrorEl.hidden = false;
    } else {
      adminErrorEl.hidden = true;
    }
  }

  function adminEmptyRow(container, text) {
    container.innerHTML = '';
    var empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = text;
    container.appendChild(empty);
  }

  // Builds a <select class="admin-status-select"> pre-selected to
  // `current`, calling onChange(newStatus, revert) whenever it changes.
  // `revert` restores the previous value if the caller's update fails.
  function buildStatusSelect(current, options, onChange) {
    var select = document.createElement('select');
    select.className = 'admin-status-select';
    var values = options.slice();
    if (current && values.indexOf(current) === -1) values.unshift(current);
    values.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      if (value === current) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      var previous = current;
      var next = select.value;
      select.disabled = true;
      onChange(next, function revert() {
        select.value = previous;
      });
      select.disabled = false;
    });
    return select;
  }

  function buildDeleteButton(onConfirm) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-delete-btn';
    btn.textContent = 'حذف';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      onConfirm(function () {
        btn.disabled = false;
      });
    });
    return btn;
  }

  function truncatedCell(text) {
    var span = document.createElement('span');
    span.className = 'admin-cell-truncate';
    span.textContent = text || '—';
    if (text) span.title = text;
    return span;
  }

  var REQUEST_STATUS_OPTIONS = ['قيد الدراسة', 'مقبول', 'مرفوض', 'مكتمل'];
  var APPLICATION_STATUS_OPTIONS = ['جديد', 'تم التواصل', 'مقبول', 'مرفوض'];

  function buildAdminRequestRow(row) {
    var el = document.createElement('div');
    el.className = 'admin-row admin-row-requests';

    el.appendChild(truncatedCell(row.game_name));
    el.appendChild(truncatedCell(row.engine));
    el.appendChild(truncatedCell(row.game_link));
    el.appendChild(truncatedCell(row.notes));

    var statusCell = document.createElement('span');
    statusCell.appendChild(buildStatusSelect(row.status, REQUEST_STATUS_OPTIONS, function (next, revert) {
      window.HarfAdmin.updateStatus('translation_requests', row.id, next).then(function () {
        row.status = next;
      }).catch(function () {
        revert();
        setAdminError('تعذّر تحديث حالة الطلب، حاول مرة أخرى.');
      });
    }));
    el.appendChild(statusCell);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(row.created_at);
    el.appendChild(dateSpan);

    var actionsCell = document.createElement('span');
    actionsCell.appendChild(buildDeleteButton(function (done) {
      window.HarfAdmin.deleteRow('translation_requests', row.id).then(function () {
        el.remove();
        if (!adminRowsEl.requests.children.length) {
          adminEmptyRow(adminRowsEl.requests, 'لا توجد طلبات ترجمة بعد');
        }
      }).catch(function () {
        done();
        setAdminError('تعذّر حذف الطلب، حاول مرة أخرى.');
      });
    }));
    el.appendChild(actionsCell);

    return el;
  }

  function buildAdminCommentRow(row) {
    var el = document.createElement('div');
    el.className = 'admin-row admin-row-comments';

    el.appendChild(truncatedCell(row.author_name));
    el.appendChild(truncatedCell(row.body));

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(row.created_at);
    el.appendChild(dateSpan);

    var actionsCell = document.createElement('span');
    actionsCell.appendChild(buildDeleteButton(function (done) {
      window.HarfAdmin.deleteRow('comments', row.id).then(function () {
        el.remove();
        if (!adminRowsEl.comments.children.length) {
          adminEmptyRow(adminRowsEl.comments, 'لا توجد تعليقات بعد');
        }
      }).catch(function () {
        done();
        setAdminError('تعذّر حذف التعليق، حاول مرة أخرى.');
      });
    }));
    el.appendChild(actionsCell);

    return el;
  }

  function buildAdminApplicationRow(row) {
    var el = document.createElement('div');
    el.className = 'admin-row admin-row-applications';

    el.appendChild(truncatedCell(row.name));
    el.appendChild(truncatedCell(row.email));
    el.appendChild(truncatedCell(row.message));

    var statusCell = document.createElement('span');
    statusCell.appendChild(buildStatusSelect(row.status, APPLICATION_STATUS_OPTIONS, function (next, revert) {
      window.HarfAdmin.updateStatus('join_applications', row.id, next).then(function () {
        row.status = next;
      }).catch(function () {
        revert();
        setAdminError('تعذّر تحديث حالة طلب الانضمام، حاول مرة أخرى.');
      });
    }));
    el.appendChild(statusCell);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(row.created_at);
    el.appendChild(dateSpan);

    var actionsCell = document.createElement('span');
    actionsCell.appendChild(buildDeleteButton(function (done) {
      window.HarfAdmin.deleteRow('join_applications', row.id).then(function () {
        el.remove();
        if (!adminRowsEl.applications.children.length) {
          adminEmptyRow(adminRowsEl.applications, 'لا توجد طلبات انضمام بعد');
        }
      }).catch(function () {
        done();
        setAdminError('تعذّر حذف طلب الانضمام، حاول مرة أخرى.');
      });
    }));
    el.appendChild(actionsCell);

    return el;
  }

  function loadAdminRequests() {
    if (!adminRowsEl.requests) return;
    window.HarfAdmin.listTranslationRequests().then(function (rows) {
      adminRowsEl.requests.innerHTML = '';
      if (!rows || !rows.length) {
        adminEmptyRow(adminRowsEl.requests, 'لا توجد طلبات ترجمة بعد');
        return;
      }
      rows.forEach(function (row) {
        adminRowsEl.requests.appendChild(buildAdminRequestRow(row));
      });
    }).catch(function () {
      setAdminError('تعذّر تحميل طلبات الترجمة، تحقق من الاتصال وحاول مرة أخرى.');
    });
  }

  function loadAdminComments() {
    if (!adminRowsEl.comments) return;
    window.HarfAdmin.listComments().then(function (rows) {
      adminRowsEl.comments.innerHTML = '';
      if (!rows || !rows.length) {
        adminEmptyRow(adminRowsEl.comments, 'لا توجد تعليقات بعد');
        return;
      }
      rows.forEach(function (row) {
        adminRowsEl.comments.appendChild(buildAdminCommentRow(row));
      });
    }).catch(function () {
      setAdminError('تعذّر تحميل التعليقات، تحقق من الاتصال وحاول مرة أخرى.');
    });
  }

  function loadAdminApplications() {
    if (!adminRowsEl.applications) return;
    window.HarfAdmin.listJoinApplications().then(function (rows) {
      adminRowsEl.applications.innerHTML = '';
      if (!rows || !rows.length) {
        adminEmptyRow(adminRowsEl.applications, 'لا توجد طلبات انضمام بعد');
        return;
      }
      rows.forEach(function (row) {
        adminRowsEl.applications.appendChild(buildAdminApplicationRow(row));
      });
    }).catch(function () {
      setAdminError('تعذّر تحميل طلبات الانضمام، تحقق من الاتصال وحاول مرة أخرى.');
    });
  }

  function loadAdminData() {
    if (!window.HarfAdmin) return;
    setAdminError(null);
    loadAdminRequests();
    loadAdminComments();
    loadAdminApplications();
  }
})();
