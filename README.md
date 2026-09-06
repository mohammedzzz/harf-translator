# Harf Translator (حرف)

Internal desktop tool for the Harf volunteer team, who translate PC games
into Arabic by hand. This shares the public Harf website's visual identity
(warm ink-and-paper aesthetic, RTL Arabic UI).

## Status

A working Electron window with sidebar navigation between five sections
(Dashboard, Projects, Translation Requests, Translated Games, Settings).
Comments, translation requests, and join-the-team applications are **real
data**, read from and written to a live Supabase (Postgres) project over
its REST API (see `renderer/supabase.js` and `SECURITY.md`). Projects and
Translated Games are still placeholders, shown as "قريبًا" (coming soon)
empty states. There is still no file I/O and no real translation logic —
a couple of small in-page interactions (a fake "preparing download" note
on the Translated Games cards, a light/dark theme toggle persisted to
`localStorage`, a fake "settings saved" note) are implemented client-side
in `renderer/renderer.js` for demonstration purposes only.

Also mock, also client-side only: a login screen gates two actions
(posting a Dashboard comment, and the "قدم طلبك" join-the-team CTA) behind
a fake `localStorage`-backed sign-in — any email/password works, there is
no real account system. The translation-request form is deliberately
**not** gated; anyone can submit one, though it now blocks submission with
an inline error until the required fields are actually filled in.

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
- `renderer/index.html` — app shell markup: top bar, sidebar nav, and the
  five section views.
- `renderer/styles.css` — the Harf visual system (colors, type, cards,
  buttons, pills, progress bars) shared conceptually with the public site.
  Colors are defined as tokens on `:root`, with a `:root[data-theme="dark"]`
  override block providing the dark palette.
- `renderer/theme-init.js` — tiny synchronous script loaded first in
  `<head>`; applies a persisted dark-theme choice before first paint so
  there's no light-then-dark flash on launch.
- `renderer/renderer.js` — client-side view switching, the small
  interactions mentioned above, and the light/dark theme toggle wiring.
  No network or filesystem access.

## Next steps (not yet implemented)

- Real project tracking and Translated Games delivery (currently "قريبًا"
  empty states) — see `renderer/supabase.js` for the tables already wired
  up for requests/comments/join-applications.
- Persist settings (profile, notifications) — only the theme choice is
  persisted today.
- Real download delivery for Translated Games (currently a fake
  "preparing download" confirmation with no file behind it).
- Replace the mock login with real Supabase Auth (or similar) if
  per-user accountability is ever needed — see "Author names are
  self-reported, not verified" in `SECURITY.md`.
- Translation editor and file/import tooling via `preload.js` + IPC.
