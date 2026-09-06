// Harf Translator — Supabase REST (PostgREST + Auth) client
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
//
// ============================================================================
// One real login for the whole app.
//
// Every regular user and the founder's admin account now go through the
// exact same Supabase Auth email+password flow (see HarfAuth below). There
// is no more anon-role access to comments, translation_requests, or
// join_applications — those tables dropped their anon policies entirely in
// the latest migration and are authenticated-only now, so every data call
// in HarfSupabase signs its request with the current user's access_token
// instead of the anon key. The `apikey` header still always carries the
// public anon key (that's just how a client identifies itself to the
// Supabase gateway; it grants nothing by itself) — `Authorization` is what
// PostgREST actually evaluates RLS against.
//
// The founder's admin account is a real Supabase Auth user like anyone
// else's (same UID as before this rebuild). It gets no special client-side
// treatment beyond a UID check after sign-in to decide whether to reveal
// the admin dashboard — the actual access boundary (seeing every row
// instead of just its own, updating/deleting rows) is enforced entirely by
// the admin-scoped RLS policies already in place on the server, which key
// off that UID regardless of what this file does.
// ============================================================================
(function () {
  'use strict';

  var SUPABASE_URL = 'https://iyxpncvsanfarypmvupx.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHBuY3ZzYW5mYXJ5cG12dXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NzM0ODQsImV4cCI6MjEwNDI0OTQ4NH0.KY9cVPqHdabfboOUCh_TKEccE0dgxHb3uD6vZ7A2KHU';

  // The one founder/admin account — same real Supabase Auth user as before
  // this rebuild, just no longer reached through a separate login modal.
  var ADMIN_UID = 'd71a09cc-cd77-4f5e-a974-98af88358e03';

  var SESSION_KEY = 'harf-session';

  /* ------------------------------------------------------------------ *
   * Session storage — one mechanism for every signed-in user (admin
   * included). {access_token, refresh_token, expires_at, user}.
   * ------------------------------------------------------------------ */

  function readSession() {
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (session) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {
      // localStorage unavailable — the session just won't survive a restart.
    }
  }

  function clearSession() {
    writeSession(null);
  }

  // Derives what to show/store as someone's display name: their chosen
  // display_name (from auth signup metadata) if present, otherwise the
  // local part of their email, otherwise a generic fallback. Used both to
  // seed their `profiles` row and to label the comments they post.
  function displayNameFor(user) {
    var meta = user && user.user_metadata;
    var name = meta && meta.display_name;
    if (name && String(name).trim()) return String(name).trim();
    var email = user && user.email;
    if (email && email.indexOf('@') > -1) return email.split('@')[0];
    return 'مستخدم';
  }

  // Best-effort: makes sure a `profiles` row exists for this user right
  // after sign-in. A conflict (the row already exists from a previous
  // login) is expected and swallowed silently; any other failure is
  // rethrown as a real error.
  function ensureProfile(session) {
    var user = session && session.user;
    if (!user || !user.id) return Promise.resolve();
    return fetch(SUPABASE_URL + '/rest/v1/profiles', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ id: user.id, display_name: displayNameFor(user) })
    }).then(function (res) {
      if (res.ok) return;
      return res.text().then(function (text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { /* not JSON */ }
        var message = (parsed && parsed.message) || '';
        var isConflict = res.status === 409 ||
          (parsed && parsed.code === '23505') ||
          /duplicate key/i.test(message) ||
          /already exists/i.test(message);
        if (isConflict) return; // expected — profile already exists.
        var err = new Error(message || 'تعذّر إنشاء الملف الشخصي.');
        err.status = res.status;
        throw err;
      });
    });
  }

  // POST {url}/auth/v1/signup. Supabase's built-in mailer sends the
  // confirmation email itself — nothing else to do here on success.
  // Every failure (already-registered email, weak password, malformed
  // address, anything else) maps to the same generic Arabic message on
  // purpose: this never confirms or denies whether a given email already
  // has an account.
  // Builds and persists a session object from a Supabase auth response body,
  // then makes sure a `profiles` row exists for it. Shared by signIn (always
  // has a session) and signUp (only has one when the project auto-confirms
  // new signups — see below).
  function storeSession(data) {
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user
    };
    writeSession(session);
    return ensureProfile(session).then(function () {
      return session;
    });
  }

  // Resolves to { session } — session is set when the project auto-confirms
  // new signups (Supabase returns a full access_token immediately, no email
  // step at all), or null when email confirmation is still required (the
  // caller should show a "check your email" message instead of entering the
  // app). Checking this per-response, rather than assuming one or the
  // other, means the UI keeps working correctly if that project setting is
  // ever flipped back.
  function signUp(email, password, displayName) {
    return fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        data: { display_name: displayName }
      })
    }).then(function (res) {
      if (res.ok) return res.json().catch(function () { return null; });
      return Promise.reject(
        new Error('تعذّر إنشاء الحساب، تحقق من البيانات أو جرّب تسجيل الدخول إذا كان لديك حساب')
      );
    }).then(function (data) {
      if (data && data.access_token && data.user) {
        return storeSession(data).then(function (session) {
          return { session: session };
        });
      }
      return { session: null };
    });
  }

  // POST {url}/auth/v1/token?grant_type=password. On success, stores the
  // session and makes sure a `profiles` row exists before resolving.
  // On failure, distinguishes "email not confirmed yet" (Supabase flags
  // this explicitly in the error body) from any other failure, which
  // always gets the same generic "بيانات الدخول غير صحيحة" — never
  // confirming or denying whether an email is registered.
  function signIn(email, password) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (res.ok) return res.json().then(function (data) { return { ok: true, data: data }; });
      return res.text().then(function (text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { /* not JSON */ }
        return { ok: false, parsed: parsed };
      });
    }).then(function (result) {
      if (!result.ok) {
        var parsed = result.parsed;
        var code = parsed && (parsed.error_code || parsed.code);
        var msg = (parsed && (parsed.msg || parsed.error_description || parsed.message)) || '';
        var isUnconfirmed = code === 'email_not_confirmed' || /confirm/i.test(msg);
        var err = new Error(isUnconfirmed
          ? 'يرجى تأكيد بريدك الإلكتروني أولاً عبر الرسالة التي أرسلناها لك'
          : 'بيانات الدخول غير صحيحة');
        err.isUnconfirmed = isUnconfirmed;
        throw err;
      }
      var data = result.data;
      if (!data || !data.access_token || !data.user) {
        throw new Error('بيانات الدخول غير صحيحة');
      }
      return storeSession(data);
    });
  }

  // POST {url}/auth/v1/token?grant_type=refresh_token — silently exchanges
  // a stored refresh_token for a new access_token once the old one expires,
  // so a restored session doesn't force a fresh login every time.
  function refreshSession() {
    var current = readSession();
    if (!current || !current.refresh_token) {
      return Promise.reject(new Error('لا توجد جلسة محفوظة.'));
    }
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token })
    }).then(function (res) {
      if (!res.ok) {
        clearSession();
        throw new Error('انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مرة أخرى.');
      }
      return res.json();
    }).then(function (data) {
      var session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || current.refresh_token,
        expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        user: data.user || current.user
      };
      writeSession(session);
      return session;
    });
  }

  // Resolves to a session whose access_token is valid for at least another
  // minute, refreshing it first if needed. Rejects (and, on a confirmed
  // expiry/refresh failure, clears the stored session) if there's no
  // session or the refresh itself fails.
  function ensureValidSession() {
    var current = readSession();
    if (!current) return Promise.reject(new Error('لا توجد جلسة محفوظة.'));
    if (current.expires_at && current.expires_at - Date.now() > 60000) {
      return Promise.resolve(current);
    }
    return refreshSession();
  }

  // Best-effort sign-out: the local session is cleared unconditionally so
  // the UI always reflects "signed out" immediately; the /auth/v1/logout
  // call to revoke the token server-side is attempted but never blocks or
  // fails the sign-out from the app's point of view.
  function signOut() {
    var current = readSession();
    clearSession();
    if (!current || !current.access_token) return Promise.resolve();
    return fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + current.access_token }
    }).catch(function () {
      // Ignored on purpose — best-effort only, see comment above.
    }).then(function () {});
  }

  function isAdmin(session) {
    return !!(session && session.user && session.user.id === ADMIN_UID);
  }

  window.HarfAuth = {
    ADMIN_UID: ADMIN_UID,
    getSession: readSession,
    hasSession: function () { return !!readSession(); },
    ensureValidSession: ensureValidSession,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    isAdmin: isAdmin,
    ensureProfile: ensureProfile,
    displayNameFor: displayNameFor
  };

  /* ------------------------------------------------------------------ *
   * HarfSupabase — authenticated PostgREST calls, signed with whoever is
   * currently logged in (regular user or the admin account alike). RLS on
   * the server decides what each of them can actually see or change —
   * this file doesn't special-case the admin UID anywhere below.
   * ------------------------------------------------------------------ */

  function authHeaders(session, extra) {
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

  // Always resolves a fresh session first (refreshing if needed) and signs
  // the call with that user's access token. Rejects with a friendly Arabic
  // message on a network failure or a non-2xx response, so callers can show
  // an inline error instead of failing silently or crashing.
  function authRequest(path, options) {
    options = options || {};
    return ensureValidSession().then(function (session) {
      return fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: options.method || 'GET',
        headers: authHeaders(session, options.headers),
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

  function listComments() {
    return authRequest('comments?select=*&order=created_at.desc');
  }

  // Author identity now comes from the signed-in session, never from
  // typed/derived input — see displayNameFor() above.
  function createComment(body) {
    return ensureValidSession().then(function (session) {
      return authRequest('comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          author_name: displayNameFor(session.user),
          body: body,
          user_id: session.user.id
        })
      });
    });
  }

  function listTranslationRequests() {
    return authRequest('translation_requests?select=*&order=created_at.desc');
  }

  function withOwner(fields, userId) {
    var payload = {};
    for (var key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) payload[key] = fields[key];
    }
    payload.user_id = userId;
    return payload;
  }

  function createTranslationRequest(fields) {
    return ensureValidSession().then(function (session) {
      return authRequest('translation_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(withOwner(fields, session.user.id))
      });
    });
  }

  // join_applications has no SELECT policy for regular authenticated users
  // — only the admin UID's policy grants read access, so this resolves to
  // an empty list for everyone else. There's still no separate public read
  // path exposed anywhere in this file.
  function listJoinApplications() {
    return authRequest('join_applications?select=*&order=created_at.desc');
  }

  function createJoinApplication(fields) {
    return ensureValidSession().then(function (session) {
      return authRequest('join_applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(withOwner(fields, session.user.id))
      });
    });
  }

  // Generic "PATCH some fields on one row" helper — updates only ever
  // succeed for the admin UID (or, per-table, a user updating their own
  // row where a policy allows it); that's enforced entirely by RLS
  // server-side, not by anything client-side here. updateStatus() below is
  // just this with a single {status} field, kept for the many call sites
  // that only ever touch that one column.
  function updateFields(table, id, fields) {
    return authRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(fields)
    });
  }

  function updateStatus(table, id, status) {
    return updateFields(table, id, { status: status });
  }

  function deleteRow(table, id) {
    return authRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE'
    });
  }

  // translated_games: any authenticated user sees published rows only (RLS
  // filters this server-side); the admin UID sees and manages every row,
  // draft or published, via this same call — see listTranslationRequests()
  // above for the identical "one call, RLS decides what comes back" shape.
  function listTranslatedGames() {
    return authRequest('translated_games?select=*&order=created_at.desc');
  }

  // Admin-only in practice (RLS has no INSERT policy for regular users on
  // this table) — always inserts as a draft; the admin dashboard's publish
  // toggle flips `published` afterward via updateFields().
  function createTranslatedGame(fields) {
    return authRequest('translated_games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(fields)
    });
  }

  window.HarfSupabase = {
    listComments: listComments,
    createComment: createComment,
    listTranslationRequests: listTranslationRequests,
    createTranslationRequest: createTranslationRequest,
    listJoinApplications: listJoinApplications,
    createJoinApplication: createJoinApplication,
    updateStatus: updateStatus,
    updateFields: updateFields,
    deleteRow: deleteRow,
    listTranslatedGames: listTranslatedGames,
    createTranslatedGame: createTranslatedGame
  };
})();
