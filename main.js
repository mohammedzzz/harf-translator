// Harf Translator — main process
// UI-only foundation phase: no backend, no file I/O, no IPC logic yet.
// This file just boots a standard Electron shell that loads the renderer.

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#EDE0CB', // matches --sand, avoids a white flash while loading
    title: 'HARF - لترجمة الألعاب',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hardening: this window only ever needs to show its own bundled
  // renderer/index.html. There is no legitimate reason for it to navigate
  // anywhere else in-process, so block that outright — this is a real app
  // running on machines we don't control now, so we don't rely on there
  // simply being no links in the UI today.
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  // Every window.open()/target="_blank"/middle-click request is denied as
  // far as Electron opening a second in-process window goes — that part is
  // unconditional. The one narrow exception: a genuine http(s) URL (the
  // renderer only ever produces these for admin-entered download/delivery
  // links on translated_games/translation_requests, always rendered with
  // target="_blank" — see renderer/renderer.js's isSafeExternalUrl()) is
  // handed to the OS's default browser via shell.openExternal instead of
  // being silently dropped, so those links are actually usable. Any other
  // scheme (or no URL) is just denied, same as before.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and there are
    // no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit like a normal desktop app on every platform except macOS.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
