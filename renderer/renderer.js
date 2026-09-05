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
   * Translation requests: toggle the "new request" placeholder form
   * ------------------------------------------------------------------ */

  var toggleBtn = document.getElementById('toggle-request-form');
  var requestForm = document.getElementById('request-form');
  var cancelBtn = document.getElementById('cancel-request-form');
  var formNote = document.getElementById('form-note');

  if (toggleBtn && requestForm) {
    toggleBtn.addEventListener('click', function () {
      requestForm.hidden = !requestForm.hidden;
      if (!requestForm.hidden) {
        formNote.hidden = true;
        requestForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (cancelBtn && requestForm) {
    cancelBtn.addEventListener('click', function () {
      requestForm.hidden = true;
    });
  }

  if (requestForm) {
    requestForm.addEventListener('submit', function (e) {
      e.preventDefault();
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
