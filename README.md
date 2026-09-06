# HARF - لترجمة الألعاب

Internal desktop tool for the Harf volunteer team, who translate PC games
into Arabic by hand. This shares the public Harf website's visual identity
(warm ink-and-paper aesthetic, RTL Arabic UI).

## Status

A working Electron window with sidebar navigation between the regular
sections (الرئيسية, Projects, Translation Requests, Translated Games,
Settings) plus a hidden admin dashboard (see below). Comments, translation
requests, join-the-team applications, and translated games are **real
data**, read from and written to a live Supabase (Postgres) project over
its REST API (see `renderer/supabase.js` and `SECURITY.md`). Projects is
still a placeholder, shown as a "قريبًا" (coming soon) empty state. There
is still no file I/O and no real translation logic — a light/dark theme
toggle persisted to `localStorage` and a fake "settings saved" note are
implemented client-side in `renderer/renderer.js` for demonstration
purposes only.

Translation Requests is split into two request types: طلب عام (مجاني) — a
public wishlist for newly-released games, free, visible to every signed-in
user — and طلب خاص (مدفوع) — a $10/game paid request for old games or old
parts/chapters, visible only to its own submitter (and the admin). The
admin dashboard's requests tab lets the admin mark a خاص request `paid`
and set a `delivery_url` once the translation is ready; the requester then
sees a "تحميل ترجمتك" button. Translated Games shows real published
`translated_games` rows with a working download link; the admin dashboard
has a matching tab to add a game as a draft and publish/unpublish it.

There is **exactly one login flow** in this app: real Supabase Auth
(email + password, with required email confirmation), gating the entire
app behind an `#auth-screen` sign-in/sign-up toggle — no session, no
topbar, no sidebar, no content. The founder's admin account signs in
through this exact same form; a client-side UID check afterward reveals
"لوحة الإدارة", a separate dashboard for managing every translation
request, comment, join application, and translated game — the real
access boundary (seeing/mutating rows others can't) is enforced entirely
server-side by RLS policies keyed off that UID. See "Authentication" in
`SECURITY.md` for exactly how this works.

The app is now packaged for distribution (see `build/`, and the `build`
config + `dist` script in `package.json`); see `SECURITY.md` for what's
hardened in the Electron shell and why, now that this runs on machines we
don't control.

## Getting started

```
npm install
npm start
```

## Structure

- `main.js` — Electron main process; creates the ~1280x800 app window and
  loads the renderer.
- `preload.js` — minimal context-bridge preload (contextIsolation on,
  nodeIntegration off), currently exposes nothing beyond a version string.
  Reserved for future features to hook into safely.
- `renderer/index.html` — app shell markup: top bar, sidebar nav, the five
  regular section views, and the hidden admin dashboard view.
- `renderer/styles.css` — the Harf visual system (colors, type, cards,
  buttons, pills, progress bars) shared conceptually with the public site.
  Colors are defined as tokens on `:root`, with a `:root[data-theme="dark"]`
  override block providing the dark palette.
- `renderer/theme-init.js` — tiny synchronous script loaded first in
  `<head>`; applies a persisted dark-theme choice before first paint so
  there's no light-then-dark flash on launch.
- `renderer/supabase.js` — `HarfAuth` (Supabase Auth session management,
  the `isAdmin()` founder-UID check) and `HarfSupabase` (authenticated
  PostgREST calls for every table, generic enough to work against any of
  them — comments, translation_requests, join_applications,
  translated_games).
- `renderer/renderer.js` — client-side view switching, the theme toggle
  wiring, the single real Supabase Auth flow (sign-in/sign-up/session
  restore), the split طلب عام / طلب خاص request panels, the public
  Translated Games list, and the admin dashboard's rendering/wiring. No
  network or filesystem access of its own — all requests go through
  `renderer/supabase.js`.

## Next steps (not yet implemented)

- Real project tracking (Projects is still a "قريبًا" empty state).
- Real payment collection for طلب خاص requests — the request form shows an
  explicit placeholder callout ("معلومات الدفع ستُضاف قريباً من قبل
  الفريق") where real payment instructions will go once ready; today the
  admin just marks a request `paid` by hand after receiving payment
  out-of-band.
- Persist settings (notifications) — only the theme choice is persisted
  today.
- Extend real Supabase Auth (currently one founder/admin UID, see
  "Authentication" in `SECURITY.md`) with finer-grained roles if
  per-user accountability beyond a single admin is ever needed.
- Translation editor and file/import tooling via `preload.js` + IPC.
