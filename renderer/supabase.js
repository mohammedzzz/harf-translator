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
})();
