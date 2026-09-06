// Harf Translator — Supabase REST (PostgREST) client
//
// No SDK here on purpose: the CSP is script-src 'self' with no CDN
// allow-listed, and there's no bundler set up to vendor
// @supabase/supabase-js. Instead this talks to Supabase's REST API
// directly with the browser's native fetch().
//
// The anon key below is DESIGNED to be public and embedded in client code
// — Supabase's access control is enforced server-side via Row Level
// Security (RLS) policies on each table, not by keeping this key secret.
// See SECURITY.md for exactly what each table's policies allow.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://iyxpncvsanfarypmvupx.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHBuY3ZzYW5mYXJ5cG12dXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NzM0ODQsImV4cCI6MjEwNDI0OTQ4NH0.KY9cVPqHdabfboOUCh_TKEccE0dgxHb3uD6vZ7A2KHU';

  function baseHeaders() {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    };
  }

  function mergeHeaders(extra) {
    var headers = baseHeaders();
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          headers[key] = extra[key];
        }
      }
    }
    return headers;
  }

  // Thin wrapper around fetch() against PostgREST (Supabase's REST API).
  // `path` is appended to /rest/v1/. Rejects with a friendly Arabic message
  // on a network failure or a non-2xx response, so callers can show an
  // inline error instead of failing silently or crashing.
  function request(path, options) {
    options = options || {};
    return fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: mergeHeaders(options.headers),
      body: options.body
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var message = 'تعذّر الاتصال بالخادم، حاول مرة أخرى.';
          try {
            var parsed = JSON.parse(text);
            if (parsed && parsed.message) message = parsed.message;
          } catch (e) {
            // Response body wasn't JSON — keep the generic message.
          }
          var err = new Error(message);
          err.status = res.status;
          throw err;
        });
      }
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        return text ? JSON.parse(text) : null;
      });
    });
  }

  function listComments() {
    return request('comments?select=*&order=created_at.desc');
  }

  function createComment(authorName, body) {
    return request('comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ author_name: authorName, body: body })
    });
  }

  function listTranslationRequests() {
    return request('translation_requests?select=*&order=created_at.desc');
  }

  function createTranslationRequest(fields) {
    return request('translation_requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(fields)
    });
  }

  // join_applications has no SELECT policy for anon — it's private to the
  // team and only ever meant to be read from the Supabase dashboard
  // directly. This file deliberately exposes no function to list/read it.
  function createJoinApplication(fields) {
    return request('join_applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(fields)
    });
  }

  window.HarfSupabase = {
    listComments: listComments,
    createComment: createComment,
    listTranslationRequests: listTranslationRequests,
    createTranslationRequest: createTranslationRequest,
    createJoinApplication: createJoinApplication
  };

  /* ========================================================================
   * HarfAdmin — real Supabase Auth admin session + authenticated REST calls
   *
   * Everything above this point uses the public anon key and is what every
   * regular user of this app talks to. Everything below belongs to one
   * specific founder account (a real Supabase Auth user, created directly
   * in the Supabase dashboard) signing in with a real email + password
   * against Supabase's own Auth REST endpoints — same project domain,
   * already covered by the existing connect-src CSP entry.
   *
   * On success, the returned `access_token` (a JWT tied to that user)
   * REPLACES the anon key in the Authorization header for REST calls in
   * this section — the `apikey` header still carries the project's public
   * anon key (that's just how a client identifies itself to the Supabase
   * gateway; it grants nothing by itself), but Authorization now carries a
   * real user JWT instead of the anon JWT. That's what makes PostgREST
   * apply the `authenticated`-role RLS policies tied to this one user
   * (SELECT/UPDATE/DELETE on translation_requests, comments, and
   * join_applications) instead of the anon-role policies. Nothing here
   * changes, widens, or bypasses anon-role access — the anon key and the
   * functions above are untouched.
   * ==================================================================== */

  var ADMIN_SESSION_KEY = 'harf-admin-session';

  function readAdminSession() {
    try {
      var raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeAdminSession(session) {
    try {
      if (session) {
        window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(ADMIN_SESSION_KEY);
      }
    } catch (e) {
      // localStorage unavailable — the admin session just won't survive a restart.
    }
  }

  function clearAdminSession() {
    writeAdminSession(null);
  }

  // Always a single generic Arabic message, regardless of what Supabase's
  // own API says (invalid_credentials, user not found, etc.) — never
  // confirm or deny whether a given email has an account.
  function adminAuthError() {
    var err = new Error('بيانات الدخول غير صحيحة');
    err.isAdminAuthError = true;
    return err;
  }

  // POST {url}/auth/v1/token?grant_type=password — real Supabase Auth
  // sign-in. Success returns {access_token, refresh_token, expires_in,
  // user:{...}}; failure returns 400 with an error body, which this always
  // maps to the same generic Arabic message via adminAuthError().
  function adminSignIn(email, password) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (!res.ok) throw adminAuthError();
      return res.json();
    }).then(function (data) {
      if (!data || !data.access_token) throw adminAuthError();
      var session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000
      };
      writeAdminSession(session);
      return session;
    });
  }

  // POST {url}/auth/v1/token?grant_type=refresh_token — silently exchanges
  // a stored refresh_token for a new access_token once the old one expires,
  // so a restored session doesn't force a fresh login every time.
  function adminRefreshSession() {
    var current = readAdminSession();
    if (!current || !current.refresh_token) {
      return Promise.reject(new Error('لا توجد جلسة مدير محفوظة.'));
    }
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token })
    }).then(function (res) {
      if (!res.ok) {
        clearAdminSession();
        throw new Error('انتهت صلاحية جلسة المدير، الرجاء تسجيل الدخول مرة أخرى.');
      }
      return res.json();
    }).then(function (data) {
      var session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || current.refresh_token,
        expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000
      };
      writeAdminSession(session);
      return session;
    });
  }

  // Resolves to a session whose access_token is valid for at least another
  // minute, refreshing it first if needed. Rejects (and, on a confirmed
  // expiry/refresh failure, clears the stored session) if there's no
  // session or the refresh itself fails.
  function getValidAdminSession() {
    var current = readAdminSession();
    if (!current) return Promise.reject(new Error('لا توجد جلسة مدير محفوظة.'));
    if (current.expires_at && current.expires_at - Date.now() > 60000) {
      return Promise.resolve(current);
    }
    return adminRefreshSession();
  }

  // Best-effort sign-out: the local session is cleared unconditionally so
  // the UI always reflects "signed out" immediately; the /auth/v1/logout
  // call to revoke the token server-side is attempted but never blocks or
  // fails the sign-out from the app's point of view.
  function adminSignOut() {
    var current = readAdminSession();
    clearAdminSession();
    if (!current || !current.access_token) return Promise.resolve();
    return fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + current.access_token }
    }).catch(function () {
      // Ignored on purpose — best-effort only, see comment above.
    }).then(function () {});
  }

  function adminHeaders(session, extra) {
    var headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + session.access_token
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
      }
    }
    return headers;
  }

  // Same PostgREST request/error shape as request() above, but always
  // resolves a fresh admin session first (refreshing if needed) and signs
  // the call with the admin's access token instead of the anon key.
  function adminRequest(path, options) {
    options = options || {};
    return getValidAdminSession().then(function (session) {
      return fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: options.method || 'GET',
        headers: adminHeaders(session, options.headers),
        body: options.body
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var message = 'تعذّر تنفيذ العملية، حاول مرة أخرى.';
          try {
            var parsed = JSON.parse(text);
            if (parsed && parsed.message) message = parsed.message;
          } catch (e) {
            // Response body wasn't JSON — keep the generic message.
          }
          var err = new Error(message);
          err.status = res.status;
          throw err;
        });
      }
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        return text ? JSON.parse(text) : null;
      });
    });
  }

  function adminListTranslationRequests() {
    return adminRequest('translation_requests?select=*&order=created_at.desc');
  }

  function adminListComments() {
    return adminRequest('comments?select=*&order=created_at.desc');
  }

  function adminListJoinApplications() {
    return adminRequest('join_applications?select=*&order=created_at.desc');
  }

  function adminUpdateStatus(table, id, status) {
    return adminRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: status })
    });
  }

  function adminDeleteRow(table, id) {
    return adminRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE'
    });
  }

  window.HarfAdmin = {
    getSession: readAdminSession,
    hasSession: function () { return !!readAdminSession(); },
    signIn: adminSignIn,
    signOut: adminSignOut,
    ensureValidSession: getValidAdminSession,
    listTranslationRequests: adminListTranslationRequests,
    listComments: adminListComments,
    listJoinApplications: adminListJoinApplications,
    updateStatus: adminUpdateStatus,
    deleteRow: adminDeleteRow
  };
})();
