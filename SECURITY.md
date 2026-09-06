# Security

HARF - لترجمة الألعاب is an Electron desktop app distributed as a Windows
installer from this public repository. This document is for anyone
auditing the source or the `.exe` before installing it.

## What this app actually is

Comments, translation requests, and join-the-team applications are **real
data**, read from and written to a live Supabase (Postgres) project over
its REST API. Projects and Translated Games are still placeholders — those
sections show a "قريبًا" (coming soon) empty state rather than fake data.

There are now **two entirely separate login flows** in this app — do not
conflate them when reasoning about the security surface:

1. **The public "تسجيل الدخول" button in the top bar** is still a
   **UI-only mock**, exactly as before: it accepts any email/password (or
   none) and just stores a name (and, as of this change, the typed email)
   in `localStorage`, purely to gate two interactions (posting a comment,
   and the join-the-team form) behind *something* resembling a sign-in.
   This is still **not** an authentication boundary and protects nothing.
   Do not mistake "the data is now real" for "the identities are now
   real": see "Author names are self-reported, not verified" below. The
   Settings → الملف الشخصي panel now mirrors this mock login's real typed
   name/email (instead of showing hardcoded fake data) and is hidden
   behind a login prompt when no one is "logged in" — this is still
   entirely cosmetic and does not change the trust model in any way.
2. **The "دخول المدير" link in the sidebar footer** is **real Supabase
   Auth**, scoped to exactly one founder account. See "Admin
   authentication" below — this is the one part of the app that is an
   actual authentication boundary.

Given that, the security surface now has three parts: the Electron shell
itself (what a downloaded `.exe`, running with a real user's OS privileges,
is allowed to do — unchanged from before, see below), the anon-key
Supabase integration described further down (unchanged by this work), and
the new real-admin-auth integration described in "Admin authentication".

## Electron process hardening

`main.js` creates its single `BrowserWindow` with:

- `contextIsolation: true` — the renderer's JavaScript world is isolated
  from the preload script's; page script cannot reach Node/Electron APIs
  directly.
- `nodeIntegration: false` — no Node globals (`require`, `process`, `fs`,
  ...) are exposed to the renderer.
- `sandbox: true` — the renderer process runs in Chromium's OS-level
  sandbox.
- No `webSecurity: false`, no `allowRunningInsecureContent`, no
  `experimentalFeatures` — all left at their secure Electron defaults.

The window only ever loads the app's own bundled `renderer/index.html` via
`loadFile` (a local path, never a remote URL). To keep it that way even if
future code introduces a link or a bug:

- `webContents.on('will-navigate', ...)` blocks any attempt to navigate
  the window away from its own page.
- `webContents.setWindowOpenHandler(...)` denies every `window.open()` /
  `target="_blank"` / middle-click new-window request outright.

There is no reason for this app to ever display remote or third-party
content, so both are unconditional denies rather than an allow-list.

## Preload script

`preload.js` exposes exactly one thing to the renderer via
`contextBridge.exposeInMainWorld('harf', { version })` — the Electron
version string, for display purposes only. It does **not** leak
`ipcRenderer`, `remote`, `require`, or any other Node/Electron API into the
page. There is currently no IPC surface at all; when real backend features
land, add narrowly-scoped `ipcRenderer.invoke` wrappers here rather than
widening this bridge.

## Content Security Policy

`renderer/index.html` sets:

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
connect-src 'self' https://iyxpncvsanfarypmvupx.supabase.co;
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

Notes:

- `script-src 'self'` — no `unsafe-inline`, no `unsafe-eval`. Every script
  is an external same-origin file (`theme-init.js`, `supabase.js`,
  `renderer.js`).
- `style-src` allows only `'self'` and the exact Google Fonts stylesheet
  origin — no `unsafe-inline`. Dynamic values that used to be inline
  `style=""` attributes (progress bar widths) are now set via
  `element.style.width` in JS instead, which CSP's `style-src` does not
  govern, so the policy didn't need to loosen to accommodate them.
- `font-src` is scoped to `fonts.gstatic.com` only, matching what the
  Google Fonts stylesheet actually requests.
- `connect-src` is scoped to `'self'` plus the exact Supabase project URL
  — the only origin the app's `fetch()` calls ever target (see "Supabase
  integration" below and "Admin authentication" further down — the
  `/auth/v1/*` endpoints used for real admin sign-in are on this same
  project domain, so no CSP change was needed to add them). No wildcard,
  no other third-party origin.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and
  `frame-ancestors 'none'` are defense-in-depth: this app uses no plugins,
  no `<base>` tag, and every `<form>` submit is intercepted in JS
  (`preventDefault()`), so none of these should ever trigger in normal use
  — they're there in case something regresses.

## Supabase integration

Comments, translation requests, and join-the-team applications are backed
by a Supabase (hosted Postgres) project, talked to directly over its REST
API (PostgREST) via `fetch()` in `renderer/supabase.js` — there is no
`@supabase/supabase-js` dependency (the CSP's `script-src 'self'` allows no
CDN, and there's no bundler set up to vendor it) and no server of this
app's own in between.

**The anon key in `renderer/supabase.js` is meant to be public.** It is
committed to this repository and shipped inside the `.exe` in plain text
on purpose — that is what Supabase's "anon" key is *for*. It identifies
the request as coming from an untrusted, unauthenticated client, nothing
more. All real access control is enforced **server-side, per table, by
Postgres Row Level Security (RLS) policies** — not by keeping this key
secret. Treat it the same as you would a public API endpoint, not like a
password or a service-role key (a service-role key, which bypasses RLS
entirely, must never appear in this codebase).

What each table's RLS policies currently allow the **anon key** to do —
this is unchanged by the admin-auth work below, and has been re-verified
live against the project after that work landed (see "Verified against
the live project"):

- **`comments`** — public read and public write (`INSERT` only — anon has
  no `UPDATE`/`DELETE` grant, confirmed live, see below). There is no
  edit or delete path exposed in the public UI.
- **`translation_requests`** — public read and public write, same as
  comments (`INSERT` only for anon). The `status` column defaults to
  `'قيد الدراسة'`; there is no public UI to change it.
- **`join_applications`** — **insert-only** for anon: the RLS policy grants
  `INSERT` but there is deliberately no `SELECT` policy, so this table
  cannot be read back through the anon key at all. `renderer/supabase.js`
  reflects this on purpose: the anon-key section exposes
  `createJoinApplication()` but no corresponding `list`/`get` function.
  **The only place this table is ever read in this app is the admin
  dashboard described below, and only after a real admin sign-in — do
  not add a public read path for this table.**

## Admin authentication

A second, unrelated authentication path exists for exactly one real
Supabase Auth account belonging to the founder (created directly in the
Supabase dashboard — this app never sees or handles that account's
password beyond passing it straight through to Supabase's own endpoint on
sign-in). It is implemented in the `HarfAdmin` section of
`renderer/supabase.js`, clearly separated from and below the anon-key
`HarfSupabase` section in the same file.

- **Sign-in**: `POST {url}/auth/v1/token?grant_type=password` with the
  anon key as `apikey` and `{email, password}` as the body — Supabase's
  standard password-grant endpoint. On success it returns
  `{access_token, refresh_token, expires_in}`; on failure (wrong password
  *or* an email with no account — Supabase's API itself does not
  distinguish these) the UI always shows the same generic
  "بيانات الدخول غير صحيحة", never confirming or denying whether an
  account exists for a given email.
- **Authenticated requests**: every admin REST call to the three tables
  sends the admin's `access_token` as `Authorization: Bearer <token>`,
  **replacing** the anon key there (the `apikey` header still carries the
  public anon key, as required by the Supabase gateway/PostgREST — that
  header alone grants nothing). This is what makes PostgREST evaluate the
  request as the `authenticated` role tied to that one specific user,
  applying the new RLS policies (confirmed live and independently, not by
  this change) that grant SELECT/UPDATE/DELETE on all three tables to that
  user's UID only — no other authenticated user, and no anon request,
  gains anything from these new policies.
- **Session storage**: `{access_token, refresh_token, expires_at}` is
  kept in `localStorage` under `harf-admin-session` so the admin session
  survives an app restart; an expired access token is silently exchanged
  for a new one via `POST {url}/auth/v1/token?grant_type=refresh_token`
  before each admin action, transparent to the user unless the refresh
  token itself is invalid/expired, at which point the stored session is
  cleared and a fresh login is required.
- **Sign-out**: the local session is always cleared immediately; a
  best-effort `POST {url}/auth/v1/logout` is also sent to revoke the
  token server-side, but its outcome never blocks or fails the sign-out
  from the app's point of view.
- **UI visibility**: the "لوحة الإدارة" nav item and its three panels
  (طلبات الترجمة / التعليقات / طلبات الانضمام — full CRUD-minus-create:
  status updates and deletes, no inserts) only render once a valid admin
  session exists; there is no other code path that reaches them. This is
  a UI convenience, not the security boundary — the actual boundary is
  the RLS policy tied to the founder's UID on the server side, which is
  what actually stops anyone else's REST calls (even someone reading this
  source and constructing requests by hand) from succeeding.
- **Blast radius if this one account's password ever leaked**: whoever
  holds it could read the full contents of `join_applications`
  (previously admin-dashboard-only) and modify/delete rows in all three
  tables. It grants nothing beyond that — no service-role access, no
  access to any other Supabase project resource, and no elevated access
  for any other account.

### Author names are self-reported, not verified

Moving comments and translation requests to a real database does **not**
mean the people posting them are verified in any way. `author_name` on a
comment is just the mock login's display name (see "What this app actually
is" above) — derived client-side from whatever email-shaped string someone
typed into the login form, which is never checked against anything. Anyone
can type any name and post as it. There is no relationship between a
comment's `author_name` and any real identity, and this integration does
nothing to change that. This is unchanged by the admin-auth work above:
real Supabase Auth now exists for exactly one founder account for the
purpose of managing/moderating this data, not for attributing it — regular
comments and requests are still posted through the anon key with a
self-reported name, by design.

### Verified against the live project

All three flows (`comments`, `translation_requests`, `join_applications`)
have been exercised end-to-end against the live Supabase project — reads
and writes succeed reliably and the RLS policies behave exactly as
documented above (public read+write on the first two, insert-only with no
read path on `join_applications`).

This was re-verified live after the admin-auth work above landed,
specifically to confirm the anon role gained nothing from it:

- `SELECT` on `comments` and `translation_requests` with the anon key:
  succeeds (200), same as before.
- `SELECT` on `join_applications` with the anon key: still `200` with an
  empty array — no read access, unchanged.
- `PATCH`/`DELETE` with the anon key against a real, existing row in
  `translation_requests` and `comments` (created for this test): both
  return `200` with an **empty array** (`Prefer: return=representation`)
  — i.e. RLS silently matches zero rows for anon, the same as before this
  change — and a follow-up `SELECT` confirmed the row was left completely
  unmodified in both cases.
- `POST` (insert) with the anon key against `comments` and
  `translation_requests`: still succeeds (`201`), unchanged.
- `POST {url}/auth/v1/token?grant_type=password` with invalid credentials:
  returns `400` with `error_code: "invalid_credentials"`, matching
  Supabase's documented shape, for both a nonexistent email and a
  malformed/wrong-password attempt alike (never distinguishable from the
  response) — confirming the sign-in UI's generic error message lines up
  with reality.
- A REST call shaped like an authenticated admin request (correct
  `apikey`, but `Authorization: Bearer` set to a syntactically invalid
  token) was rejected by PostgREST with `401`/`PGRST301` ("Expected 3
  parts in JWT"), confirming the `Authorization` header is actually
  parsed and enforced as a JWT for these calls rather than being ignored
  in favor of `apikey`.

**Not verified live** (and not verifiable without the founder's real
password, which this work never had access to and never should):
signing in with the founder's actual credentials, and the resulting
authenticated-role REST calls actually returning/mutating rows end to
end. The request/response shapes above were checked against Supabase's
documented Auth API instead.

Two clearly-labeled test rows (`___HARF_RLS_TEST___`, one in
`translation_requests`, one in `comments`) were created via the anon key
as part of this verification and are still in the live database — they
were deliberately left as-is (the anon key that created them cannot
delete them, which is itself part of what the test confirmed). Delete
them from the new admin dashboard, or the Supabase dashboard directly,
whenever convenient.

## Dependencies

`electron` and `electron-builder` are the only dependencies, both
`devDependencies` — nothing ships inside the packaged app except the
app's own `main.js`, `preload.js`, `renderer/`, and `package.json` (see
the `files` list in `package.json`). No `@supabase/supabase-js` or any
other runtime dependency was added — the Supabase integration is plain
`fetch()` calls, kept dependency-free on purpose (see "Supabase
integration" above).

## Reporting an issue

This is a small volunteer-team tool; if you find a real security problem
(not a placeholder-data / mock-login concern — those are by design), please
open a GitHub issue on this repo.
