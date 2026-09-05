# Harf Translator (حرف)

Internal desktop tool for the Harf volunteer team, who translate PC games
into Arabic by hand. This shares the public Harf website's visual identity
(warm ink-and-paper aesthetic, RTL Arabic UI).

## Status

**UI-only foundation.** This is the initial shell: a working Electron window
with sidebar navigation between five sections (Dashboard, Projects,
Translation Requests, Translated Games, Settings), all populated with
static placeholder content. There is no backend, no file I/O, and no real
translation logic yet — navigation and a couple of small in-page
interactions (toggling the "new request" form, a fake "preparing download"
note on the Translated Games cards, a light/dark theme toggle persisted to
`localStorage`, a fake "settings saved" note) are implemented client-side
in `renderer/renderer.js` for demonstration purposes only.

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

- Wire real project/request data from a backend or local store.
- Persist settings (profile, notifications) — only the theme choice is
  persisted today.
- Real download delivery for Translated Games (currently a fake
  "preparing download" confirmation with no file behind it).
- Wire the "join the team" CTA to an actual application flow.
- Translation editor and file/import tooling via `preload.js` + IPC.
