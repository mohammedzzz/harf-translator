# Security

HARF - لترجمة الألعاب is an Electron desktop app distributed as a Windows
installer from this public repository. This document is for anyone
auditing the source or the `.exe` before installing it.

## What this app actually is

Comments, translation requests, join-the-team applications, and translated
games are **real data**, read from and written to a live Supabase
(Postgres) project over its REST API. Projects is still a placeholder —
that section shows a "قريبًا" (coming soon) empty state rather than fake
data.

**There is exactly one login flow in this app now**, and it is real
Supabase Auth (email + password, with required email confirmation) for
every user — there is no more mock login and no separate admin login. The
entire app is gated behind it: with no valid session, the only thing that
renders is the auth screen (sign-in / sign-up toggle) — no topbar, no
sidebar, no content, no way to read or write anything. See "Authentication"
below for exactly how it works.

The founder's admin account is a real Supabase Auth user like anyone
else's, signing in through this same form. The only thing special about it
client-side is a UID check after sign-in (`user.id === 'd71a09cc-cd77-4f5e-
a974-98af88358e03'`) that reveals the "لوحة الإدارة" nav item — that check
decides nothing about what the account can actually *do*. The real
boundary — that this one UID can see and mutate rows other users can't —
is enforced entirely server-side by RLS policies keyed off that UID, the
same way it was before this rebuild.

Given that, the security surface has three parts: the Electron shell
itself (what a downloaded `.exe`, running with a real user's OS privileges,
is allowed to do — unchanged from before, see below), the CSP/preload
hardening (also unchanged), and the Supabase Auth + RLS integration
described in "Authentication" and "Supabase integration" below.

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
  the window away from its own page — unconditionally, no allow-list.
- `webContents.setWindowOpenHandler(...)` denies every `window.open()` /
  `target="_blank"` / middle-click request from ever opening a second
  in-process window — also unconditional. The one narrow exception: if the
  requested URL is `http(s)`, it's forwarded to the OS's default browser
  via `shell.openExternal()` before the request is denied, so that a real
  download/delivery link (an admin-entered `translated_games.download_url`
  or `translation_requests.delivery_url`, always rendered with
  `target="_blank"` — see `isSafeExternalUrl()` in `renderer/renderer.js`)
  actually opens somewhere. Any other scheme is just denied like before;
  nothing ever opens *inside* this app's own window except its own bundled
  page.

There is no reason for this app to ever display remote or third-party
content inside its own window, so `will-navigate` stays an unconditional
deny; the one link out to the user's own browser above is the sole
exception to "deny by default" in the Electron shell.

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
  integration" and "Authentication" below — the `/auth/v1/*` endpoints
  used for sign-up/sign-in/sign-out are on this same project domain, so no
  CSP change was needed to add them). No wildcard, no other third-party
  origin.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and
  `frame-ancestors 'none'` are defense-in-depth: this app uses no plugins,
  no `<base>` tag, and every `<form>` submit is intercepted in JS
  (`preventDefault()`), so none of these should ever trigger in normal use
  — they're there in case something regresses.

## Supabase integration

Comments, translation requests, join-the-team applications, and (now)
profiles are backed by a Supabase (hosted Postgres) project, talked to
directly over its REST API (PostgREST) and Auth API via `fetch()` in
`renderer/supabase.js` — there is no `@supabase/supabase-js` dependency
(the CSP's `script-src 'self'` allows no CDN, and there's no bundler set
up to vendor it) and no server of this app's own in between.

**The anon key in `renderer/supabase.js` is meant to be public.** It is
committed to this repository and shipped inside the `.exe` in plain text
on purpose — that is what Supabase's "anon" key is *for*. It identifies
the request as coming from an untrusted client, nothing more, and every
call still sends it as the `apikey` header (required by the Supabase
gateway itself). All real access control is enforced **server-side, per
table, by Postgres Row Level Security (RLS) policies** — not by keeping
this key secret, and not by anything client-side in this file. Treat it
the same as you would a public API endpoint, not like a password or a
service-role key (a service-role key, which bypasses RLS entirely, must
never appear in this codebase).

**`comments`, `translation_requests`, and `join_applications` are now
authenticated-only** — a migration dropped their `anon`-role policies
entirely (confirmed live: an anon `SELECT` on any of the three returns an
empty array, and an anon `INSERT` is rejected with `42501`). Every read
and write to them now goes through `authRequest()` in
`renderer/supabase.js`, which signs the call with the *current signed-in
user's* `access_token` instead of the anon key — there is no code path
left in this app that touches these tables without a real session. Per
table:

- **`comments`** — any authenticated user can `INSERT` a row with their
  own `user_id` and `SELECT` all rows. Only the admin UID's
  policy grants `UPDATE`/`DELETE` (used by the admin dashboard's
  status-free delete button).
- **`translation_requests`** — any authenticated user can `INSERT` a row
  with their own `user_id`, and `SELECT` either their own rows or any row
  marked `request_type = 'عام'`. The admin UID's policy additionally grants
  full `SELECT`/`UPDATE`/`DELETE` on every row. Beyond the original columns,
  this table now also has `request_type` ('عام' default, or 'خاص'), `paid`
  (bool, default false), `payment_confirmed_at`, and `delivery_url` —
  `paid` and `delivery_url` are only ever written by the admin dashboard
  (via `HarfSupabase.updateFields()`, RLS-enforced the same as `status`),
  and `delivery_url` is only ever rendered as a clickable link client-side
  when it's `http(s)` (see `isSafeExternalUrl()` in `renderer/renderer.js`).
  The app splits `عام` (public wishlist — shown to everyone, without the
  requester's identity) from `خاص` (paid — shown only to its own submitter,
  by construction of the RLS policy above) entirely client-side in
  `renderer/renderer.js`'s `loadRequests()`; the server-side boundary is
  what actually stops a `خاص` row leaking to anyone but its own submitter
  and the admin.
- **`translated_games`** — new table: `game_name`, `engine`, `version`,
  `file_size`, `download_url`, `published` (bool, default false),
  `created_at`. Any authenticated user can `SELECT` rows where
  `published = true`; there is no `INSERT`/`UPDATE`/`DELETE` policy for
  regular users at all. The admin UID's policy grants full CRUD, which is
  what backs the admin dashboard's "add as draft" → "نشر/إلغاء النشر"
  workflow. The public "الألعاب المترجمة" view also filters to `published`
  client-side (on top of what RLS already guarantees for non-admins) so
  the admin's own drafts never show up in that view even for the admin's
  own account.
- **`join_applications`** — **insert-only** for regular authenticated
  users: they can `INSERT` a row with their own `user_id` but there is no
  `SELECT` policy for them, so this table cannot be read back by anyone
  except the admin UID. `renderer/supabase.js`'s `listJoinApplications()`
  reflects this by construction, not by a client-side check: it issues the
  same authenticated `SELECT` for everyone, and RLS alone decides whether
  it comes back empty or full. **The only place this table is ever
  displayed in this app is the admin dashboard.**

**`profiles`** is new: `id` (= the auth user's UID), `display_name`,
`created_at`. Any authenticated user can `SELECT` every row (public
display names) but can only `INSERT`/`UPDATE` their own. Right after every
sign-in, `HarfAuth.ensureProfile()` tries to insert `{id, display_name}`
for the current user with `Prefer: return=minimal`; a conflict (the row
already exists from a previous login) is expected and swallowed, any
other failure is a real error.

## Authentication

There is exactly one Supabase Auth flow, implemented in the `HarfAuth`
section of `renderer/supabase.js`, and every user of this app — including
the founder's admin account — goes through it the same way.

- **Sign-up**: `POST {url}/auth/v1/signup` with `{email, password,
  data: {display_name}}`. Email confirmation is required on this project
  (not auto-confirm) — Supabase's own mailer sends the confirmation email;
  this app does nothing further. Every failure (already-registered email,
  weak password, malformed address, anything else) maps to one generic
  Arabic message that never confirms or denies whether a given email is
  already registered.
- **Sign-in**: `POST {url}/auth/v1/token?grant_type=password`. On success
  it stores `{access_token, refresh_token, expires_at, user}` and then
  calls `ensureProfile()` (see above). On failure, the response body is
  inspected to distinguish "email not confirmed yet" (Supabase flags this
  explicitly) from anything else — an unconfirmed email gets a message
  telling the user to check their inbox; every other failure (wrong
  password, no such account, anything else — Supabase's API does not
  distinguish these) gets the same generic "بيانات الدخول غير صحيحة",
  never confirming or denying whether an account exists for a given email.
- **Session storage**: `{access_token, refresh_token, expires_at, user}`
  is kept in `localStorage` under `harf-session` — one key, for every user,
  admin included (this replaces the old admin-only `harf-admin-session`).
  An expired access token is silently exchanged for a new one via
  `POST {url}/auth/v1/token?grant_type=refresh_token` before each
  authenticated request; if the refresh token itself is invalid/expired,
  the stored session is cleared and the app falls back to the auth screen.
- **Sign-out**: the local session is always cleared immediately, which is
  what actually returns the user to the auth screen; a best-effort
  `POST {url}/auth/v1/logout` is also sent to revoke the token
  server-side, but its outcome never blocks or fails the sign-out.
- **Admin is the same login, not a separate one**: after any successful
  sign-in, the client checks `user.id === 'd71a09cc-cd77-4f5e-a974-
  98af88358e03'` (the founder's real, pre-existing Supabase Auth UID) and,
  if it matches, reveals the "لوحة الإدارة" nav item and dashboard. This
  check is a UI convenience only — the actual boundary, exactly as before
  this rebuild, is the RLS policies on the server keyed off that same UID,
  which is what actually stops anyone else's REST calls (even someone
  reading this source and constructing requests by hand) from succeeding.
- **Blast radius if the founder's account password ever leaked**: whoever
  holds it could read the full contents of `join_applications` and
  modify/delete rows in `comments`/`translation_requests`. It grants
  nothing beyond that — no service-role access, no access to any other
  Supabase project resource, and no elevated access for any other account.

### Comment/request identity is now real, not self-reported

Before this rebuild, `author_name` on a comment was a self-reported string
from a mock login with no verification at all. That is gone. Comments are
now posted with the signed-in user's real `user_id` (`auth.uid()`, enforced
by the `INSERT` policy) and an `author_name` derived server-side-adjacent
from their session — their chosen `display_name` from sign-up, or their
email's local part as a fallback — never from typed input. The same
`user_id` attribution now applies to `translation_requests` and
`join_applications` inserts too.

### Verified against the live project

This rebuild replaced the entire auth system without access to any real
user's credentials, so verification here means confirming request/response
*shapes* and RLS *enforcement* against the live project with throwaway
data, not completing a real signup-confirm-login cycle. What was actually
exercised with `curl` against the live project:

- `POST /auth/v1/signup` with a syntactically-invalid test address:
  returns `400` with `{code, error_code: "email_address_invalid", msg}` —
  confirms the error body shape this app's `signUp()` branches on.
- `POST /auth/v1/token?grant_type=password` with a nonexistent email/wrong
  password: returns `400` with `{code, error_code: "invalid_credentials",
  msg: "Invalid login credentials"}` — confirms the generic-failure path.
- `POST /rest/v1/profiles` with a syntactically-plausible but invalid
  bearer token (three dot-separated segments, not a real JWT): rejected
  with `401` / `PGRST301` ("JWT cryptographic operation failed").
- `POST /rest/v1/profiles` with the anon key instead of a user token:
  rejected with `401` / `42501` ("new row violates row-level security
  policy for table \"profiles\"") — confirms anon truly has no insert
  path into `profiles`.
- `GET /rest/v1/comments` with the anon key: returns `200` with `[]` —
  confirms the anon-role read policy is really gone, not just untested.

**Not verified live** (blocked by the project's built-in-mailer send-rate
limit, hit after the first real signup attempt above, and by not having
any confirmed test account to sign in with): a full signup → email
confirmation → sign-in cycle end to end, the exact response shape of a
*successful* signup, and the exact `error_code` Supabase returns for a
signup against an already-registered email (this app treats every signup
failure the same way regardless, specifically so this distinction never
needs to reach the user or be relied on). The "email not confirmed" error
branch in `signIn()` is implemented against Supabase's documented
behavior (`error_code: "email_not_confirmed"`) with a message-text
fallback, but was not observed live for the same reason.

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
(not a placeholder-data concern like the "قريبًا" Projects section — that's
by design), please open a GitHub issue on this repo.
