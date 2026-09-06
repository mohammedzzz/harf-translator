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
})();
