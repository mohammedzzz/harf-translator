# HARF - لترجمة الألعاب

Internal desktop tool for the Harf volunteer team, who translate PC games
into Arabic by hand. This shares the public Harf website's visual identity
(warm ink-and-paper aesthetic, RTL Arabic UI).

## Status

A working Electron window with sidebar navigation between the regular
sections (Dashboard, Projects, Translation Requests, Translated Games,
Settings) plus a hidden admin dashboard (see below). Comments, translation
requests, and join-the-team applications are **real data**, read from and
written to a live Supabase (Postgres) project over its REST API (see
`renderer/supabase.js` and `SECURITY.md`). Projects and Translated Games
are still placeholders, shown as "قريبًا" (coming soon) empty states.
There is still no file I/O and no real translation logic — a couple of
small in-page interactions (a fake "preparing download" note on the
Translated Games cards, a light/dark theme toggle persisted to
`localStorage`, a fake "settings saved" note) are implemented client-side
in `renderer/renderer.js` for demonstration purposes only.

This app now has **two separate, unrelated login flows** — do not confuse
them:

- **Public login** (the "تسجيل الدخول" button in the top bar): still a
  UI-only mock, exactly as before. It gates two actions (posting a
  Dashboard comment, and the "قدم طلبك" join-the-team CTA) behind a fake
  `localStorage`-backed sign-in — any email/password works, there is no
  real account system, and it protects nothing. The translation-request
  form is deliberately **not** gated; anyone can submit one, though it
  blocks submission with an inline error until the required fields are
  actually filled in. Settings → الملف الشخصي now reflects this mock
  login's real typed-in name/email instead of showing fabricated data,
  and is hidden behind a "سجّل الدخول لعرض ملفك الشخصي" prompt when no one
  is logged in.
- **Admin login** ("دخول المدير", a small muted link in the sidebar
  footer): real Supabase Auth, for exactly one founder account. Signing in
  there reveals "لوحة الإدارة", a separate dashboard for managing every
  translation request, comment, and join application (status updates and
  deletes), backed by RLS policies scoped to that one authenticated user.
  See "Admin authentication" in `SECURITY.md` for exactly how this works
  and why it cannot widen access for anyone else.

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
- `renderer/renderer.js` — client-side view switching, the small
  interactions mentioned above, the light/dark theme toggle wiring, both
  login flows (mock public login and real admin login), and the admin
  dashboard's rendering/wiring. No network or filesystem access of its
  own — all requests go through `renderer/supabase.js`.

## Next steps (not yet implemented)

- Real project tracking and Translated Games delivery (currently "قريبًا"
  empty states) — see `renderer/supabase.js` for the tables already wired
  up for requests/comments/join-applications.
- Persist settings (notifications) — only the theme choice and, as of the
  admin/profile work, the mock login's name/email are persisted today.
- Real download delivery for Translated Games (currently a fake
  "preparing download" confirmation with no file behind it).
- Extend real Supabase Auth (currently one founder account only, see
  "Admin authentication" in `SECURITY.md`) to more team members if
  per-user accountability beyond the founder is ever needed. The public
  login stays intentionally mock — see "Author names are self-reported,
  not verified" in `SECURITY.md`.
- Translation editor and file/import tooling via `preload.js` + IPC.
