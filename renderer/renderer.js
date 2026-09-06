// Harf Translator — renderer process
// Client-side view switching plus small cosmetic interactions, real data
// (comments, translation requests — split into طلب عام / طلب خاص —
// join-the-team applications, and translated games) read from and written
// to Supabase (see supabase.js), and one real, mandatory Supabase Auth
// sign-in gating the entire app — see the "Auth" section near the bottom
// of this file and SECURITY.md. Still no file I/O and no real translation
// logic.

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

  // Status text (as stored in the `status` column) mapped to a pill color.
  // New requests always arrive as 'قيد الدراسة' (the column default) —
  // the other values only ever appear once the team updates a row from the
  // admin dashboard.
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

  // Builds one .req-row for the طلب عام (مجاني) list — this is a public
  // community wishlist (RLS returns every request_type = 'عام' row to any
  // signed-in user, not just its own submitter), so it deliberately shows
  // only game/engine/status/date and never the requester's identity.
  // Every value here can be arbitrary text typed by a user, so it's
  // assigned via textContent (never innerHTML) to avoid injecting markup.
  function buildGeneralRequestRow(reqRow) {
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

  // Builds one .req-row for the طلب خاص (مدفوع) list — RLS only ever
  // returns a signed-in user's OWN خاص rows (plus the admin's), so this
  // list is inherently private; it additionally shows the paid state and,
  // once the admin sets one, a real download link.
  function buildPrivateRequestRow(reqRow) {
    var row = document.createElement('div');
    row.className = 'req-row req-row-private';

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

    var paidWrap = document.createElement('span');
    var paidPill = document.createElement('span');
    paidPill.className = 'pill ' + (reqRow.paid ? 'pill-good' : 'pill-neutral');
    paidPill.textContent = reqRow.paid ? 'مدفوع' : 'غير مدفوع';
    paidWrap.appendChild(paidPill);
    row.appendChild(paidWrap);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(reqRow.created_at);
    row.appendChild(dateSpan);

    var actionSpan = document.createElement('span');
    if (reqRow.delivery_url && isSafeExternalUrl(reqRow.delivery_url)) {
      var link = document.createElement('a');
      link.className = 'btn btn-primary btn-small';
      link.href = reqRow.delivery_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'تحميل ترجمتك';
      actionSpan.appendChild(link);
    } else {
      actionSpan.textContent = '—';
    }
    row.appendChild(actionSpan);

    return row;
  }

  // Only ever render http(s) links as clickable — main.js's window-open
  // handler forwards these to the OS default browser (see main.js); any
  // other scheme is shown as plain, inert text instead of a link.
  function isSafeExternalUrl(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function renderRequestList(rowsEl, list, buildRow, emptyText) {
    if (!rowsEl) return;
    rowsEl.innerHTML = '';
    if (!list || !list.length) {
      var empty = document.createElement('div');
      empty.className = 'req-empty';
      empty.textContent = emptyText;
      rowsEl.appendChild(empty);
      return;
    }
    list.forEach(function (reqRow) {
      rowsEl.appendChild(buildRow(reqRow));
    });
  }

  var reqRowsGeneral = document.getElementById('req-rows-general');
  var reqRowsPrivate = document.getElementById('req-rows-private');
  var reqListErrorGeneral = document.getElementById('req-list-error-general');
  var reqListErrorPrivate = document.getElementById('req-list-error-private');

  // One authenticated call returns everything RLS allows this user to see:
  // every request_type = 'عام' row from anyone, plus this user's own rows
  // of either type. Split client-side by request_type so a user's own
  // خاص requests never leak into the public عام list next to it.
  function loadRequests() {
    if (!window.HarfSupabase) return;
    window.HarfSupabase.listTranslationRequests().then(function (rows) {
      if (reqListErrorGeneral) reqListErrorGeneral.hidden = true;
      if (reqListErrorPrivate) reqListErrorPrivate.hidden = true;
      var general = [];
      var priv = [];
      (rows || []).forEach(function (reqRow) {
        if (reqRow.request_type === 'خاص') priv.push(reqRow);
        else general.push(reqRow);
      });
      renderRequestList(reqRowsGeneral, general, buildGeneralRequestRow, 'لا توجد طلبات عامة بعد');
      renderRequestList(reqRowsPrivate, priv, buildPrivateRequestRow, 'لا توجد طلبات خاصة بعد');
    }).catch(function () {
      if (reqRowsGeneral) reqRowsGeneral.innerHTML = '';
      if (reqRowsPrivate) reqRowsPrivate.innerHTML = '';
      var msg = 'تعذّر تحميل طلبات الترجمة، تحقق من الاتصال وحاول مرة أخرى.';
      if (reqListErrorGeneral) { reqListErrorGeneral.textContent = msg; reqListErrorGeneral.hidden = false; }
      if (reqListErrorPrivate) { reqListErrorPrivate.textContent = msg; reqListErrorPrivate.hidden = false; }
    });
  }

  // Wires one request-type panel's toggle/cancel/submit buttons — shared
  // between the طلب عام and طلب خاص panels, which differ only in which
  // fixed request_type they submit and which list/row-builder they prepend
  // into on success.
  function setupRequestPanel(cfg) {
    if (!cfg.form) return;

    function resetFeedback() {
      cfg.formNote.hidden = true;
      cfg.formError.hidden = true;
      cfg.form.querySelectorAll('.field.is-invalid').forEach(function (field) {
        field.classList.remove('is-invalid');
      });
    }

    if (cfg.toggleBtn) {
      cfg.toggleBtn.addEventListener('click', function () {
        cfg.form.hidden = !cfg.form.hidden;
        if (!cfg.form.hidden) {
          resetFeedback();
          cfg.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    if (cfg.cancelBtn) {
      cfg.cancelBtn.addEventListener('click', function () {
        cfg.form.hidden = true;
        cfg.form.reset();
        resetFeedback();
      });
    }

    function submit() {
      if (!window.HarfSupabase) return;
      var submitBtn = cfg.form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      var payload = {
        game_name: cfg.gameNameInput.value.trim(),
        engine: (cfg.engineInput && cfg.engineInput.value.trim()) || null,
        game_link: (cfg.gameLinkInput && cfg.gameLinkInput.value.trim()) || null,
        notes: (cfg.notesInput && cfg.notesInput.value.trim()) || null,
        request_type: cfg.type
      };

      window.HarfSupabase.createTranslationRequest(payload).then(function (rows) {
        var row = rows && rows[0];
        if (row && cfg.rowsEl) {
          var emptyNotice = cfg.rowsEl.querySelector('.req-empty');
          if (emptyNotice) emptyNotice.remove();
          cfg.rowsEl.insertBefore(cfg.buildRow(row), cfg.rowsEl.firstChild);
        }
        cfg.form.reset();
        resetFeedback();
        cfg.formNote.hidden = false;
      }).catch(function () {
        cfg.formNote.hidden = true;
        cfg.formError.textContent = 'تعذّر إرسال الطلب، تحقق من الاتصال وحاول مرة أخرى.';
        cfg.formError.hidden = false;
      }).finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    }

    cfg.form.querySelectorAll('[required]').forEach(function (control) {
      control.addEventListener('input', function () {
        var field = control.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    });

    cfg.form.addEventListener('submit', function (e) {
      e.preventDefault();

      var missing = [];
      var firstInvalid = null;
      cfg.form.querySelectorAll('[required]').forEach(function (control) {
        var field = control.closest('.field');
        var isEmpty = !control.value.trim();
        if (field) field.classList.toggle('is-invalid', isEmpty);
        if (isEmpty) {
          missing.push((field && field.dataset.field) || 'حقل مطلوب');
          if (!firstInvalid) firstInvalid = control;
        }
      });

      if (missing.length) {
        cfg.formNote.hidden = true;
        cfg.formError.textContent = 'الرجاء تعبئة الحقول التالية قبل الإرسال: ' + missing.join('، ');
        cfg.formError.hidden = false;
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      cfg.formError.hidden = true;
      submit();
    });
  }

  setupRequestPanel({
    type: 'عام',
    toggleBtn: document.getElementById('toggle-request-form-general'),
    form: document.getElementById('request-form-general'),
    cancelBtn: document.getElementById('cancel-request-form-general'),
    formNote: document.getElementById('form-note-general'),
    formError: document.getElementById('form-error-general'),
    gameNameInput: document.getElementById('req-general-game-name'),
    engineInput: document.getElementById('req-general-engine'),
    gameLinkInput: document.getElementById('req-general-game-link'),
    notesInput: document.getElementById('req-general-notes'),
    rowsEl: reqRowsGeneral,
    buildRow: buildGeneralRequestRow
  });

  setupRequestPanel({
    type: 'خاص',
    toggleBtn: document.getElementById('toggle-request-form-private'),
    form: document.getElementById('request-form-private'),
    cancelBtn: document.getElementById('cancel-request-form-private'),
    formNote: document.getElementById('form-note-private'),
    formError: document.getElementById('form-error-private'),
    gameNameInput: document.getElementById('req-private-game-name'),
    engineInput: document.getElementById('req-private-engine'),
    gameLinkInput: document.getElementById('req-private-game-link'),
    notesInput: document.getElementById('req-private-notes'),
    rowsEl: reqRowsPrivate,
    buildRow: buildPrivateRequestRow
  });

  // طلب عام / طلب خاص tab switching — same show/hide-by-key pattern as the
  // admin dashboard's tabs further down this file.
  var requestTypeTabs = document.querySelectorAll('.request-type-tabs .admin-tab');
  var requestTypePanels = {
    general: document.getElementById('request-panel-general'),
    private: document.getElementById('request-panel-private')
  };
  requestTypeTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.requestTab;
      requestTypeTabs.forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      Object.keys(requestTypePanels).forEach(function (key) {
        if (requestTypePanels[key]) requestTypePanels[key].classList.toggle('is-active', key === target);
      });
    });
  });

  // Not called here: translation_requests is authenticated-only now, so
  // there's nothing to load until a session exists — see enterApp() in the
  // "Auth" section, which calls this once sign-in succeeds or an existing
  // session is restored.

  /* ------------------------------------------------------------------ *
   * Translated games (public view): real published games fetched from
   * Supabase. RLS already filters translated_games to `published = true`
   * for every non-admin user; the admin UID's policy would return drafts
   * too, so this also filters client-side to `published` rows — this is
   * the public "what can be downloaded" view, not the admin's management
   * list, even when an admin happens to be the one looking at it.
   * ------------------------------------------------------------------ */

  var gamesGrid = document.getElementById('games-grid');
  var gamesEmptyState = document.getElementById('games-empty-state');
  var gamesListError = document.getElementById('games-list-error');

  // Builds one .project-card for a published translated_games row. Text
  // values are arbitrary strings the admin typed in, assigned via
  // textContent (never innerHTML); the download link is only rendered when
  // its URL is http(s) — see isSafeExternalUrl() above.
  function buildGameCard(gameRow) {
    var card = document.createElement('div');
    card.className = 'project-card';

    var top = document.createElement('div');
    top.className = 'project-card-top';
    var h3 = document.createElement('h3');
    h3.className = 'en-title';
    h3.textContent = gameRow.game_name || '';
    top.appendChild(h3);
    card.appendChild(top);

    if (gameRow.engine) {
      var tag = document.createElement('p');
      tag.className = 'tag';
      tag.textContent = gameRow.engine;
      card.appendChild(tag);
    }

    var metaBits = [];
    if (gameRow.version) metaBits.push('الإصدار ' + gameRow.version);
    if (gameRow.file_size) metaBits.push(gameRow.file_size);
    if (metaBits.length) {
      var meta = document.createElement('p');
      meta.className = 'project-meta';
      meta.textContent = metaBits.join(' · ');
      card.appendChild(meta);
    }

    var actions = document.createElement('div');
    actions.className = 'game-card-actions';
    if (gameRow.download_url && isSafeExternalUrl(gameRow.download_url)) {
      var link = document.createElement('a');
      link.className = 'btn btn-primary btn-download';
      link.href = gameRow.download_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'تحميل';
      actions.appendChild(link);
    }
    card.appendChild(actions);

    return card;
  }

  function renderGames(list) {
    if (!gamesGrid || !gamesEmptyState) return;
    gamesGrid.innerHTML = '';
    var published = (list || []).filter(function (gameRow) { return gameRow.published; });
    if (!published.length) {
      gamesGrid.hidden = true;
      gamesEmptyState.hidden = false;
      return;
    }
    published.forEach(function (gameRow) {
      gamesGrid.appendChild(buildGameCard(gameRow));
    });
    gamesGrid.hidden = false;
    gamesEmptyState.hidden = true;
  }

  function loadTranslatedGames() {
    if (!window.HarfSupabase) return;
    window.HarfSupabase.listTranslatedGames().then(function (rows) {
      if (gamesListError) gamesListError.hidden = true;
      renderGames(rows);
    }).catch(function () {
      if (gamesListError) {
        gamesListError.textContent = 'تعذّر تحميل قائمة الألعاب المترجمة، تحقق من الاتصال وحاول مرة أخرى.';
        gamesListError.hidden = false;
      }
    });
  }

  // Not called here: translated_games is authenticated-only, so there's
  // nothing to load until a session exists — see enterApp() in the "Auth"
  // section, which calls this once sign-in succeeds or an existing session
  // is restored.

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
   * Settings → الملف الشخصي: no gate needed any more — the whole app is
   * behind one real sign-in (see the "Auth" section near the bottom of
   * this file), so by the time this view can even be reached there is
   * always a signed-in user. Populated from the current session there.
   * ------------------------------------------------------------------ */

  var profileNameInput = document.getElementById('profile-name-input');
  var profileEmailInput = document.getElementById('profile-email-input');

  /* ------------------------------------------------------------------ *
   * Dashboard comments: fetched from Supabase on load. Posting one no
   * longer needs a login gate — being in the app at all means you're
   * already signed in — and the author identity comes from the signed-in
   * session (see HarfSupabase.createComment in supabase.js), never from
   * typed input.
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

  function submitComment(text) {
    if (!window.HarfSupabase) return;
    clearCommentError();
    var submitBtn = commentForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var session = window.HarfAuth && window.HarfAuth.getSession();
    var authorName = window.HarfAuth ? window.HarfAuth.displayNameFor(session && session.user) : 'مستخدم';

    window.HarfSupabase.createComment(text).then(function (rows) {
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
      submitComment(text);
    });
  }

  // Not called here: comments are authenticated-only now, so there's
  // nothing to load until a session exists — see enterApp() in the "Auth"
  // section, which calls this once sign-in succeeds or an existing session
  // is restored.

  /* ------------------------------------------------------------------ *
   * "قدم طلبك" join-the-team CTA: no login gate needed — being in the app
   * at all means you're already signed in. Opens a small modal
   * (name/email/optional message), POSTs to the join_applications table
   * (insert-only for regular users; see HarfSupabase.createJoinApplication
   * in supabase.js), and never reads it back here — only the admin
   * dashboard below can read that table, per its RLS policy.
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
      openJoinModal();
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
   * Admin dashboard: three sub-tabs (طلبات الترجمة / التعليقات /
   * طلبات الانضمام), each backed by the same authenticated PostgREST calls
   * every signed-in user has access to (see HarfSupabase in supabase.js) —
   * there is no separate admin-only client any more. What each call
   * actually returns/allows is decided entirely server-side by RLS keyed
   * off the signed-in user's UID (see the "Auth" section below for where
   * that UID is checked to decide whether to show this view at all).
   * join_applications is never read anywhere else in this app — this is
   * the one and only place its rows are ever displayed, and only the
   * admin UID's RLS policy actually returns any for it.
   * ------------------------------------------------------------------ */

  var navAdminItem = document.getElementById('nav-admin-item');

  var adminTabs = document.querySelectorAll('.admin-tabs:not(.request-type-tabs) .admin-tab');
  var adminPanels = {
    requests: document.getElementById('admin-panel-requests'),
    comments: document.getElementById('admin-panel-comments'),
    applications: document.getElementById('admin-panel-applications'),
    games: document.getElementById('admin-panel-games')
  };
  var adminRowsEl = {
    requests: document.getElementById('admin-requests-rows'),
    comments: document.getElementById('admin-comments-rows'),
    applications: document.getElementById('admin-applications-rows'),
    games: document.getElementById('admin-games-rows')
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
  var REQUEST_TYPE_LABEL = { 'عام': 'عام (مجاني)', 'خاص': 'خاص (مدفوع)' };

  // Builds the "مدفوع toggle + رابط تسليم" mini-form shown only for طلب
  // خاص rows. Uses HarfSupabase.updateFields() (a small generic PATCH
  // helper, see supabase.js) rather than updateStatus(), since it needs to
  // set the `paid` boolean and `delivery_url` columns, not `status`.
  function buildPaymentControls(row) {
    var wrap = document.createElement('div');
    wrap.className = 'admin-payment-controls';

    var paidBtn = document.createElement('button');
    paidBtn.type = 'button';
    paidBtn.className = 'admin-paid-toggle' + (row.paid ? ' is-paid' : '');
    paidBtn.textContent = row.paid ? 'مدفوع ✓' : 'تحديد كمدفوع';
    paidBtn.addEventListener('click', function () {
      var next = !row.paid;
      paidBtn.disabled = true;
      window.HarfSupabase.updateFields('translation_requests', row.id, { paid: next }).then(function () {
        row.paid = next;
        paidBtn.classList.toggle('is-paid', next);
        paidBtn.textContent = next ? 'مدفوع ✓' : 'تحديد كمدفوع';
      }).catch(function () {
        setAdminError('تعذّر تحديث حالة الدفع، حاول مرة أخرى.');
      }).finally(function () {
        paidBtn.disabled = false;
      });
    });
    wrap.appendChild(paidBtn);

    var urlRow = document.createElement('div');
    urlRow.className = 'admin-delivery-row';

    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'admin-delivery-input';
    urlInput.placeholder = 'رابط التسليم (Google Drive وغيره)';
    urlInput.value = row.delivery_url || '';
    urlInput.maxLength = 1000;
    urlRow.appendChild(urlInput);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'link-btn admin-delivery-save';
    saveBtn.textContent = 'حفظ';
    saveBtn.addEventListener('click', function () {
      var value = urlInput.value.trim();
      saveBtn.disabled = true;
      window.HarfSupabase.updateFields('translation_requests', row.id, { delivery_url: value || null }).then(function () {
        row.delivery_url = value || null;
      }).catch(function () {
        setAdminError('تعذّر حفظ رابط التسليم، حاول مرة أخرى.');
      }).finally(function () {
        saveBtn.disabled = false;
      });
    });
    urlRow.appendChild(saveBtn);

    wrap.appendChild(urlRow);
    return wrap;
  }

  function buildAdminRequestRow(row) {
    var el = document.createElement('div');
    el.className = 'admin-row admin-row-requests';

    var typeCell = document.createElement('span');
    var typePill = document.createElement('span');
    typePill.className = 'pill ' + (row.request_type === 'خاص' ? 'pill-mid' : 'pill-neutral');
    typePill.textContent = REQUEST_TYPE_LABEL[row.request_type] || 'عام (مجاني)';
    typeCell.appendChild(typePill);
    el.appendChild(typeCell);

    el.appendChild(truncatedCell(row.game_name));
    el.appendChild(truncatedCell(row.engine));
    el.appendChild(truncatedCell(row.game_link));
    el.appendChild(truncatedCell(row.notes));

    var statusCell = document.createElement('span');
    statusCell.appendChild(buildStatusSelect(row.status, REQUEST_STATUS_OPTIONS, function (next, revert) {
      window.HarfSupabase.updateStatus('translation_requests', row.id, next).then(function () {
        row.status = next;
      }).catch(function () {
        revert();
        setAdminError('تعذّر تحديث حالة الطلب، حاول مرة أخرى.');
      });
    }));
    el.appendChild(statusCell);

    var paymentCell = document.createElement('span');
    if (row.request_type === 'خاص') {
      paymentCell.appendChild(buildPaymentControls(row));
    } else {
      paymentCell.className = 'admin-cell-dim';
      paymentCell.textContent = '—';
    }
    el.appendChild(paymentCell);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(row.created_at);
    el.appendChild(dateSpan);

    var actionsCell = document.createElement('span');
    actionsCell.appendChild(buildDeleteButton(function (done) {
      window.HarfSupabase.deleteRow('translation_requests', row.id).then(function () {
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
      window.HarfSupabase.deleteRow('comments', row.id).then(function () {
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
      window.HarfSupabase.updateStatus('join_applications', row.id, next).then(function () {
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
      window.HarfSupabase.deleteRow('join_applications', row.id).then(function () {
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
    window.HarfSupabase.listTranslationRequests().then(function (rows) {
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
    window.HarfSupabase.listComments().then(function (rows) {
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
    window.HarfSupabase.listJoinApplications().then(function (rows) {
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

  // Builds one row for the "الألعاب المترجمة" admin tab: game/engine/
  // version/file_size, a نشر/إلغاء النشر toggle that flips `published` via
  // updateFields(), and a delete button — same shape as the other admin
  // tables above.
  function buildAdminGameRow(row) {
    var el = document.createElement('div');
    el.className = 'admin-row admin-row-games';

    el.appendChild(truncatedCell(row.game_name));
    el.appendChild(truncatedCell(row.engine));
    el.appendChild(truncatedCell(row.version));
    el.appendChild(truncatedCell(row.file_size));

    var statusCell = document.createElement('span');
    var publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'admin-publish-toggle' + (row.published ? ' is-published' : '');
    publishBtn.textContent = row.published ? 'منشورة — إلغاء النشر' : 'مسودة — نشر';
    publishBtn.addEventListener('click', function () {
      var next = !row.published;
      publishBtn.disabled = true;
      window.HarfSupabase.updateFields('translated_games', row.id, { published: next }).then(function () {
        row.published = next;
        publishBtn.classList.toggle('is-published', next);
        publishBtn.textContent = next ? 'منشورة — إلغاء النشر' : 'مسودة — نشر';
      }).catch(function () {
        setAdminError('تعذّر تحديث حالة النشر، حاول مرة أخرى.');
      }).finally(function () {
        publishBtn.disabled = false;
      });
    });
    statusCell.appendChild(publishBtn);
    el.appendChild(statusCell);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'mono';
    dateSpan.textContent = formatDateOnly(row.created_at);
    el.appendChild(dateSpan);

    var actionsCell = document.createElement('span');
    actionsCell.appendChild(buildDeleteButton(function (done) {
      window.HarfSupabase.deleteRow('translated_games', row.id).then(function () {
        el.remove();
        if (!adminRowsEl.games.children.length) {
          adminEmptyRow(adminRowsEl.games, 'لا توجد ألعاب مترجمة بعد');
        }
      }).catch(function () {
        done();
        setAdminError('تعذّر حذف اللعبة، حاول مرة أخرى.');
      });
    }));
    el.appendChild(actionsCell);

    return el;
  }

  function loadAdminGames() {
    if (!adminRowsEl.games) return;
    window.HarfSupabase.listTranslatedGames().then(function (rows) {
      adminRowsEl.games.innerHTML = '';
      if (!rows || !rows.length) {
        adminEmptyRow(adminRowsEl.games, 'لا توجد ألعاب مترجمة بعد');
        return;
      }
      rows.forEach(function (row) {
        adminRowsEl.games.appendChild(buildAdminGameRow(row));
      });
    }).catch(function () {
      setAdminError('تعذّر تحميل الألعاب المترجمة، حاول مرة أخرى.');
    });
  }

  function loadAdminData() {
    if (!window.HarfSupabase) return;
    setAdminError(null);
    loadAdminRequests();
    loadAdminComments();
    loadAdminApplications();
    loadAdminGames();
  }

  /* ------------------------------------------------------------------ *
   * Admin: add a new translated game as a draft (published defaults to
   * false server-side, but is also sent explicitly here for clarity) —
   * publishing happens afterward via the نشر toggle in buildAdminGameRow().
   * ------------------------------------------------------------------ */

  var adminGameForm = document.getElementById('admin-game-form');
  var adminGameFormError = document.getElementById('admin-game-form-error');
  var adminGameFormNote = document.getElementById('admin-game-form-note');
  var adminGameNameInput = document.getElementById('admin-game-name');
  var adminGameEngineInput = document.getElementById('admin-game-engine');
  var adminGameVersionInput = document.getElementById('admin-game-version');
  var adminGameFilesizeInput = document.getElementById('admin-game-filesize');
  var adminGameDownloadUrlInput = document.getElementById('admin-game-download-url');

  if (adminGameForm) {
    adminGameForm.querySelectorAll('[required]').forEach(function (control) {
      control.addEventListener('input', function () {
        var field = control.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    });

    adminGameForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (adminGameFormNote) adminGameFormNote.hidden = true;
      if (adminGameFormError) adminGameFormError.hidden = true;

      var missing = [];
      var firstInvalid = null;
      adminGameForm.querySelectorAll('[required]').forEach(function (control) {
        var field = control.closest('.field');
        var isEmpty = !control.value.trim();
        if (field) field.classList.toggle('is-invalid', isEmpty);
        if (isEmpty) {
          missing.push((field && field.dataset.field) || 'حقل مطلوب');
          if (!firstInvalid) firstInvalid = control;
        }
      });
      if (missing.length) {
        if (adminGameFormError) {
          adminGameFormError.textContent = 'الرجاء تعبئة الحقول التالية قبل الإرسال: ' + missing.join('، ');
          adminGameFormError.hidden = false;
        }
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var payload = {
        game_name: adminGameNameInput.value.trim(),
        engine: (adminGameEngineInput && adminGameEngineInput.value.trim()) || null,
        version: (adminGameVersionInput && adminGameVersionInput.value.trim()) || null,
        file_size: (adminGameFilesizeInput && adminGameFilesizeInput.value.trim()) || null,
        download_url: adminGameDownloadUrlInput.value.trim(),
        published: false
      };

      var submitBtn = adminGameForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      window.HarfSupabase.createTranslatedGame(payload).then(function (rows) {
        var row = rows && rows[0];
        if (row && adminRowsEl.games) {
          var emptyNotice = adminRowsEl.games.querySelector('.admin-empty');
          if (emptyNotice) emptyNotice.remove();
          adminRowsEl.games.insertBefore(buildAdminGameRow(row), adminRowsEl.games.firstChild);
        }
        adminGameForm.reset();
        if (adminGameFormNote) adminGameFormNote.hidden = false;
      }).catch(function () {
        if (adminGameFormError) {
          adminGameFormError.textContent = 'تعذّر إضافة اللعبة، حاول مرة أخرى.';
          adminGameFormError.hidden = false;
        }
      }).finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Auth: one real Supabase Auth sign-in for the whole app (see HarfAuth
   * in supabase.js). Until there is a valid session, the auth screen is
   * the ONLY thing rendered — no topbar, no sidebar, no content — and it
   * is the app's default state in the HTML (#app-topbar and #app-shell
   * start `hidden`; #auth-screen starts visible). Once signed in, this
   * reveals the topbar + app shell and — for exactly one UID, the
   * founder's real account — the "لوحة الإدارة" nav item too. There is no
   * more separate admin login: whoever signs in with that account gets
   * the admin view automatically, and every server-side privilege it has
   * (seeing every row, updating/deleting) comes from RLS policies keyed
   * off that UID, not from anything decided here.
   * ------------------------------------------------------------------ */

  var authScreen = document.getElementById('auth-screen');
  var appTopbar = document.getElementById('app-topbar');
  var appShell = document.getElementById('app-shell');

  var userChipName = document.getElementById('user-chip-name');
  var userChipAvatar = document.getElementById('user-chip-avatar');
  var logoutBtn = document.getElementById('logout-btn');

  var authTabSignin = document.getElementById('auth-tab-signin');
  var authTabSignup = document.getElementById('auth-tab-signup');
  var signinForm = document.getElementById('signin-form');
  var signinEmail = document.getElementById('signin-email');
  var signinPassword = document.getElementById('signin-password');
  var signinError = document.getElementById('signin-error');
  var signinSubmit = document.getElementById('signin-submit');
  var signupForm = document.getElementById('signup-form');
  var signupName = document.getElementById('signup-name');
  var signupEmail = document.getElementById('signup-email');
  var signupPassword = document.getElementById('signup-password');
  var signupError = document.getElementById('signup-error');
  var signupSuccess = document.getElementById('signup-success');
  var signupSubmit = document.getElementById('signup-submit');

  function showAuthScreen() {
    if (authScreen) authScreen.hidden = false;
    if (appTopbar) appTopbar.hidden = true;
    if (appShell) appShell.hidden = true;
  }

  function showApp() {
    if (authScreen) authScreen.hidden = true;
    if (appTopbar) appTopbar.hidden = false;
    if (appShell) appShell.hidden = false;
  }

  function setAuthMode(mode) {
    var isSignup = mode === 'signup';
    if (authTabSignin) {
      authTabSignin.classList.toggle('is-active', !isSignup);
      authTabSignin.setAttribute('aria-selected', String(!isSignup));
    }
    if (authTabSignup) {
      authTabSignup.classList.toggle('is-active', isSignup);
      authTabSignup.setAttribute('aria-selected', String(isSignup));
    }
    if (signinForm) signinForm.hidden = isSignup;
    if (signupForm) signupForm.hidden = !isSignup;
    if (signinError) signinError.hidden = true;
    if (signupError) signupError.hidden = true;
  }

  if (authTabSignin) authTabSignin.addEventListener('click', function () { setAuthMode('signin'); });
  if (authTabSignup) authTabSignup.addEventListener('click', function () { setAuthMode('signup'); });

  // Populates the topbar user chip and the always-visible Settings →
  // الملف الشخصي panel from the current session, and shows/hides the admin
  // nav item based on whether this UID is the one founder account.
  function applySessionToUI(session) {
    var user = session && session.user;
    var name = window.HarfAuth.displayNameFor(user);
    if (userChipName) userChipName.textContent = name;
    if (userChipAvatar) userChipAvatar.textContent = name.trim().charAt(0) || 'ح';
    if (profileNameInput) profileNameInput.value = name;
    if (profileEmailInput) profileEmailInput.value = (user && user.email) || '—';

    var admin = window.HarfAuth.isAdmin(session);
    if (navAdminItem) navAdminItem.hidden = !admin;
    if (!admin && navAdminItem && navAdminItem.classList.contains('is-active')) {
      // The admin view was open under a since-replaced admin session —
      // fall back to the regular dashboard rather than leaving an inert
      // admin nav active.
      showSection('dashboard');
    }
  }

  function enterApp(session) {
    applySessionToUI(session);
    showApp();
    loadComments();
    loadRequests();
    loadTranslatedGames();
    if (window.HarfAuth.isAdmin(session)) loadAdminData();
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logoutBtn.disabled = true;
      window.HarfAuth.signOut().finally(function () {
        logoutBtn.disabled = false;
        showAuthScreen();
      });
    });
  }

  function setFormError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  if (signinForm) {
    signinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (signinError) signinError.hidden = true;
      var email = signinEmail ? signinEmail.value.trim() : '';
      var password = signinPassword ? signinPassword.value : '';
      if (!email || !password) {
        setFormError(signinError, 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.');
        return;
      }
      if (signinSubmit) {
        signinSubmit.disabled = true;
        signinSubmit.textContent = 'جارٍ الدخول...';
      }
      window.HarfAuth.signIn(email, password).then(function (session) {
        signinForm.reset();
        enterApp(session);
      }).catch(function (err) {
        setFormError(signinError, (err && err.message) || 'بيانات الدخول غير صحيحة');
      }).finally(function () {
        if (signinSubmit) {
          signinSubmit.disabled = false;
          signinSubmit.textContent = 'تسجيل الدخول';
        }
      });
    });
  }

  if (signupForm) {
    signupForm.querySelectorAll('[required]').forEach(function (control) {
      control.addEventListener('input', function () {
        var field = control.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    });

    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (signupError) signupError.hidden = true;
      if (signupSuccess) signupSuccess.hidden = true;

      var missing = [];
      var firstInvalid = null;
      signupForm.querySelectorAll('[required]').forEach(function (control) {
        var field = control.closest('.field');
        var isEmpty = !control.value.trim();
        if (field) field.classList.toggle('is-invalid', isEmpty);
        if (isEmpty) {
          missing.push((field && field.dataset.field) || 'حقل مطلوب');
          if (!firstInvalid) firstInvalid = control;
        }
      });
      if (missing.length) {
        setFormError(signupError, 'الرجاء تعبئة الحقول التالية قبل الإرسال: ' + missing.join('، '));
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var name = signupName.value.trim();
      var email = signupEmail.value.trim();
      var password = signupPassword.value;

      if (signupSubmit) {
        signupSubmit.disabled = true;
        signupSubmit.textContent = 'جارٍ الإنشاء...';
      }
      window.HarfAuth.signUp(email, password, name).then(function () {
        signupForm.reset();
        setAuthMode('signin');
        if (signinEmail) signinEmail.value = email;
        if (signupSuccess) {
          signupSuccess.textContent = 'أرسلنا رسالة تأكيد إلى بريدك الإلكتروني. افتحها واضغط على رابط التأكيد، ثم سجّل الدخول من هنا.';
          signupSuccess.hidden = false;
        }
      }).catch(function (err) {
        setFormError(signupError, (err && err.message) || 'تعذّر إنشاء الحساب، تحقق من البيانات أو جرّب تسجيل الدخول إذا كان لديك حساب');
      }).finally(function () {
        if (signupSubmit) {
          signupSubmit.disabled = false;
          signupSubmit.textContent = 'إنشاء حساب';
        }
      });
    });
  }

  // Restore an existing session on launch, refreshing it first if the
  // access token has expired. The auth screen is already what the HTML
  // shows by default, so a missing/invalid/unrefreshable session needs no
  // extra handling here — it's a no-op in that case.
  if (window.HarfAuth && window.HarfAuth.hasSession()) {
    window.HarfAuth.ensureValidSession().then(function (session) {
      // Best-effort self-heal: if a previous sign-in's profile-row check
      // failed transiently, retry it quietly now without blocking entry.
      window.HarfAuth.ensureProfile(session).catch(function () {});
      enterApp(session);
    }).catch(function () {
      showAuthScreen();
    });
  }
})();
