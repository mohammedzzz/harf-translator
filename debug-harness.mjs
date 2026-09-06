// Debug harness — loads the real renderer/index.html markup into jsdom,
// executes the actual (unmodified) supabase.js and renderer.js source files
// against the LIVE Supabase backend, then simulates: sign up a brand-new
// throwaway user, then separately drive the sign-IN form with those same
// credentials (this is what the bug report describes: create an account,
// then go sign in). Prints any uncaught exception / unhandled rejection /
// console output along the way, and reports whether the app shell became
// visible after sign-in.
//
// Run: node debug-harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(__dirname, 'renderer');

function log(...args) {
  console.log('[harness]', ...args);
}

async function run() {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');

  const dom = new JSDOM(html, {
    url: 'file://' + rendererDir.replace(/\\/g, '/') + '/index.html',
    runScripts: 'outside-only', // we run the app scripts ourselves via vm
    pretendToBeVisual: true
  });

  const { window } = dom;

  // jsdom's built-in localStorage requires the `storageQuota`/file backing
  // in some versions; polyfill a simple in-memory one to be safe and
  // deterministic regardless of jsdom version behavior.
  function makeMemoryStorage() {
    let store = Object.create(null);
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; },
      clear() { store = Object.create(null); },
      key(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  }

  let hasRealLocalStorage = false;
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
    hasRealLocalStorage = true;
  } catch (e) {
    hasRealLocalStorage = false;
  }
  if (!hasRealLocalStorage) {
    log('jsdom localStorage unavailable, installing in-memory polyfill:', String(hasRealLocalStorage));
    Object.defineProperty(window, 'localStorage', {
      value: makeMemoryStorage(),
      configurable: true
    });
  }

  // Wire real network fetch (Node 18+ native fetch) onto the jsdom window —
  // jsdom does not implement fetch itself.
  window.fetch = fetch;

  // Surface uncaught errors / unhandled promise rejections from inside the
  // jsdom window instead of letting them vanish silently (which is exactly
  // the reported symptom: "nothing happens, no visible error").
  const errors = [];
  window.addEventListener('error', function (e) {
    errors.push({ type: 'error', message: e.message, error: e.error, filename: e.filename, lineno: e.lineno });
    console.error('[window.onerror]', e.message, e.error && e.error.stack ? '\n' + e.error.stack : '');
  });
  window.addEventListener('unhandledrejection', function (e) {
    errors.push({ type: 'unhandledrejection', reason: e.reason });
    console.error('[unhandledrejection]', e.reason && e.reason.stack ? e.reason.stack : e.reason);
  });

  // Forward the jsdom window's console to our real console with a tag, so
  // any console.log/error/warn the app code does is visible here too.
  ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
    const orig = window.console[level] ? window.console[level].bind(window.console) : null;
    window.console[level] = function (...args) {
      console[level]('[page console]', ...args);
      if (orig) orig(...args);
    };
  });

  // Run the two app scripts EXACTLY as a browser would: as plain classic
  // scripts (IIFEs attaching to `window`), in the jsdom window's context,
  // in the same order index.html loads them (supabase.js then renderer.js).
  const context = dom.getInternalVMContext ? dom.getInternalVMContext() : window;
  function runScript(relPath) {
    const filePath = path.join(rendererDir, relPath);
    const src = fs.readFileSync(filePath, 'utf8');
    const script = new vm.Script(src, { filename: filePath });
    script.runInContext(context);
  }

  log('Loading theme-init.js ...');
  runScript('theme-init.js');
  log('Loading supabase.js ...');
  runScript('supabase.js');
  log('Loading renderer.js ...');
  runScript('renderer.js');
  log('All scripts loaded without a synchronous throw.');

  const document = window.document;

  function fireInputEvent(el) {
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error('setValue: no element with id="' + id + '" found in the DOM (index.html/renderer.js id mismatch?)');
    }
    el.value = value;
    fireInputEvent(el);
    return el;
  }

  function submitForm(id) {
    const form = document.getElementById(id);
    if (!form) {
      throw new Error('submitForm: no element with id="' + id + '" found in the DOM');
    }
    // Use requestSubmit-equivalent: dispatch a real submit event that
    // bubbles and is cancelable, exactly like a browser click on the
    // submit button would produce.
    const evt = new window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(evt);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Poll a predicate until true or timeout, since the auth flow is
  // asynchronous (real network calls to Supabase).
  async function waitFor(predicate, { timeout = 15000, interval = 100, label = 'condition' } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (predicate()) return true;
      await sleep(interval);
    }
    throw new Error('Timed out waiting for: ' + label);
  }

  const timestamp = Date.now();
  const testEmail = 'debug-' + timestamp + '@example.com';
  const testPassword = 'DebugPass123!';
  const testName = 'مستخدم تجريبي';

  log('=== STEP 1: SIGN UP with fresh throwaway account ===', testEmail);

  setValue('signup-name', testName);
  setValue('signup-email', testEmail);
  setValue('signup-password', testPassword);

  const signupSubmitBtn = document.getElementById('signup-submit');
  submitForm('signup-form');

  // Wait for the signup submit button to re-enable (finally() block) as a
  // signal the async chain settled.
  await waitFor(function () {
    return signupSubmitBtn && signupSubmitBtn.disabled === false && signupSubmitBtn.textContent === 'إنشاء حساب';
  }, { timeout: 20000, label: 'signup submit to settle' }).catch(function (e) {
    log('WARNING:', e.message);
  });

  await sleep(300); // let any trailing microtasks (ensureProfile etc.) flush

  const appShellAfterSignup = document.getElementById('app-shell');
  const authScreenAfterSignup = document.getElementById('auth-screen');
  const signupErrorEl = document.getElementById('signup-error');
  const signupSuccessEl = document.getElementById('signup-success');

  log('After signup: auth-screen.hidden =', authScreenAfterSignup && authScreenAfterSignup.hidden,
      '| app-shell.hidden =', appShellAfterSignup && appShellAfterSignup.hidden);
  log('After signup: signup-error hidden/text =', signupErrorEl && signupErrorEl.hidden, JSON.stringify(signupErrorEl && signupErrorEl.textContent));
  log('After signup: signup-success hidden/text =', signupSuccessEl && signupSuccessEl.hidden, JSON.stringify(signupSuccessEl && signupSuccessEl.textContent));

  const storedSessionAfterSignup = window.localStorage.getItem('harf-session');
  log('localStorage harf-session present after signup:', !!storedSessionAfterSignup);

  // Regardless of whether signup auto-entered the app, now simulate signing
  // OUT (if we got in) and then going through the sign-IN form fresh — this
  // is literally the reported repro: "user creates an account, goes to
  // sign in, enters email+password, clicks sign-in".
  if (appShellAfterSignup && !appShellAfterSignup.hidden) {
    log('Signup auto-entered the app (auto-confirm). Signing back out to reproduce the separate sign-in flow ...');
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    }
    await sleep(500);
    log('After manual sign-out: auth-screen.hidden =', authScreenAfterSignup.hidden, '| app-shell.hidden =', appShellAfterSignup.hidden);
  }

  log('=== STEP 2: SIGN IN with the just-created credentials ===');

  errors.length = 0; // reset error tracker for the sign-in phase specifically

  setValue('signin-email', testEmail);
  setValue('signin-password', testPassword);

  const signinSubmitBtn = document.getElementById('signin-submit');
  const signinErrorEl = document.getElementById('signin-error');

  submitForm('signin-form');

  await waitFor(function () {
    return signinSubmitBtn && signinSubmitBtn.disabled === false && signinSubmitBtn.textContent === 'تسجيل الدخول';
  }, { timeout: 20000, label: 'signin submit to settle' }).catch(function (e) {
    log('WARNING:', e.message);
  });

  await sleep(500); // let any trailing microtasks flush

  const appShellAfterSignin = document.getElementById('app-shell');
  const appTopbarAfterSignin = document.getElementById('app-topbar');
  const authScreenAfterSignin = document.getElementById('auth-screen');

  log('--- RESULT ---');
  log('signin-email/password fields after submit:', JSON.stringify(document.getElementById('signin-email').value), JSON.stringify(document.getElementById('signin-password').value));
  log('auth-screen.hidden =', authScreenAfterSignin.hidden);
  log('app-topbar.hidden =', appTopbarAfterSignin.hidden);
  log('app-shell.hidden =', appShellAfterSignin.hidden);
  log('signin-error hidden/text =', signinErrorEl.hidden, JSON.stringify(signinErrorEl.textContent));

  const commentListEl = document.getElementById('comment-list');
  log('comment-list innerHTML length after sign-in (did loadComments render anything?):', commentListEl ? commentListEl.innerHTML.length : 'N/A');
  log('comment-list contents snippet:', commentListEl ? commentListEl.innerHTML.slice(0, 300) : 'N/A');

  const userChipNameEl = document.getElementById('user-chip-name');
  log('user-chip-name textContent:', userChipNameEl && userChipNameEl.textContent);

  log('Captured errors/unhandled-rejections during sign-in phase:', errors.length);
  errors.forEach(function (e, i) {
    console.error('  [' + i + ']', e.type, e.message || '', e.error && e.error.stack ? '\n' + e.error.stack : '', e.reason && e.reason.stack ? '\n' + e.reason.stack : e.reason || '');
  });

  const success = !authScreenAfterSignin.hidden === false &&
    authScreenAfterSignin.hidden === true &&
    appShellAfterSignin.hidden === false &&
    appTopbarAfterSignin.hidden === false;

  log('=== FINAL VERDICT: sign-in flow ' + (success ? 'SUCCEEDED — app shell visible.' : 'FAILED — app shell did NOT become visible.') + ' ===');

  if (!success) {
    process.exitCode = 1;
  }
}

run().catch(function (err) {
  console.error('[harness] FATAL uncaught error running the harness itself:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
