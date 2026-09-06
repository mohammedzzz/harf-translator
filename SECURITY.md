# Security

Harf Translator is an Electron desktop app distributed as a Windows
installer from this public repository. This document is for anyone
auditing the source or the `.exe` before installing it.

## What this app actually is

Comments, translation requests, and join-the-team applications are **real
data**, read from and written to a live Supabase (Postgres) project over
its REST API. Projects and Translated Games are still placeholders — those
sections show a "قريبًا" (coming soon) empty state rather than fake data.

"Logging in" on the Dashboard is still a **UI-only mock**, exactly as
before: it accepts any email/password (or none) and just flips a
`localStorage` flag, purely to gate two interactions (posting a comment,
and the join-the-team form) behind *something* resembling a sign-in. This
has **not changed** with the move to a real database — it is still **not**
an authentication boundary and protects nothing. Do not mistake "the data
is now real" for "the identities are now real": see "Author names are
self-reported, not verified" below.

Given that, the security surface now has two parts: the Electron shell
itself (what a downloaded `.exe`, running with a real user's OS privileges,
is allowed to do — unchanged from before, see below), and the Supabase
integration described in the new section further down.

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
  integration" below). No wildcard, no other third-party origin.
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

What each table's RLS policies currently allow the anon key to do:

- **`comments`** — public read and public write. Anyone running this app
  can `SELECT` every comment and `INSERT` new ones. There is no edit or
  delete path exposed in the UI.
- **`translation_requests`** — public read and public write, same as
  comments. The `status` column defaults to `'قيد الدراسة'`; the app has
  no UI to change it — that happens from the Supabase dashboard directly.
- **`join_applications`** — **insert-only** for anon: the RLS policy grants
  `INSERT` but there is deliberately no `SELECT` policy, so this table
  cannot be read back through the anon key at all. `renderer/supabase.js`
  reflects this on purpose: it exposes `createJoinApplication()` but no
  corresponding `list`/`get` function, and no code path in this app ever
  attempts to read this table. Submitted applications (name, email,
  message) are visible only to whoever has direct Supabase dashboard
  access. **Do not add a read path for this table to the app.**

### Author names are self-reported, not verified

Moving comments and translation requests to a real database does **not**
mean the people posting them are verified in any way. `author_name` on a
comment is just the mock login's display name (see "What this app actually
is" above) — derived client-side from whatever email-shaped string someone
typed into the login form, which is never checked against anything. Anyone
can type any name and post as it. There is no relationship between a
comment's `author_name` and any real identity, and this integration does
nothing to change that. If real per-user accountability is ever needed,
the mock login must be replaced with real Supabase Auth (or similar) first
— adding a database is not the same project as adding authentication.

### Verified against the live project

All three flows (`comments`, `translation_requests`, `join_applications`)
have been exercised end-to-end against the live Supabase project — reads
and writes succeed reliably and the RLS policies behave exactly as
documented above (public read+write on the first two, insert-only with no
read path on `join_applications`).

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
