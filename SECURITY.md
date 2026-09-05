# Security

Harf Translator is an Electron desktop app distributed as a Windows
installer from this public repository. This document is for anyone
auditing the source or the `.exe` before installing it.

## What this app actually is

Everything in the app — projects, requests, comments, translated-games
downloads, login — is **static placeholder UI with no backend**. There is
no server, no database, no real user accounts, and no network calls of any
kind. "Logging in" on the Dashboard is a UI-only mock: it accepts any
email/password (or none) and just flips a `localStorage` flag, purely to
demonstrate a login-gated interaction flow. It is **not** an authentication
boundary and protects nothing — do not rely on it for anything sensitive,
and do not extend it into real auth without replacing this mechanism
entirely.

Given that, the only *real* security surface is the Electron shell itself:
what a downloaded `.exe`, running with a real user's OS privileges, is
allowed to do.

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
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

Notes:

- `script-src 'self'` — no `unsafe-inline`, no `unsafe-eval`. Every script
  is an external same-origin file (`theme-init.js`, `renderer.js`).
- `style-src` allows only `'self'` and the exact Google Fonts stylesheet
  origin — no `unsafe-inline`. Dynamic values that used to be inline
  `style=""` attributes (progress bar widths) are now set via
  `element.style.width` in JS instead, which CSP's `style-src` does not
  govern, so the policy didn't need to loosen to accommodate them.
- `font-src` is scoped to `fonts.gstatic.com` only, matching what the
  Google Fonts stylesheet actually requests.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and
  `frame-ancestors 'none'` are defense-in-depth: this app uses no plugins,
  no `<base>` tag, and every `<form>` submit is intercepted in JS
  (`preventDefault()`), so none of these should ever trigger in normal use
  — they're there in case something regresses.

## Dependencies

`electron` and `electron-builder` are the only dependencies, both
`devDependencies` — nothing ships inside the packaged app except the
app's own `main.js`, `preload.js`, `renderer/`, and `package.json` (see
the `files` list in `package.json`).

## Reporting an issue

This is a small volunteer-team tool; if you find a real security problem
(not a placeholder-data / mock-login concern — those are by design), please
open a GitHub issue on this repo.
