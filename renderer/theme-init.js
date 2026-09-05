// Harf Translator — early theme bootstrap
// Runs synchronously in <head>, before the body paints, so a persisted
// dark-theme choice applies immediately instead of flashing light first.
// renderer.js does the actual toggle wiring later; this file only restores
// whatever was saved last time.
(function () {
  'use strict';
  try {
    if (window.localStorage.getItem('harf-theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // localStorage unavailable — fall back to the light theme silently.
  }
})();
