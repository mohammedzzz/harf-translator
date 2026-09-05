// Harf Translator — preload script
// Runs in an isolated context with access to Node APIs before the renderer
// loads. Nothing is exposed yet — this is a placeholder bridge for future
// features (project data, file access, translation memory, etc.) to hook
// into safely without enabling nodeIntegration in the renderer.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('harf', {
  // Reserved for future use, e.g.:
  // getProjects: () => ipcRenderer.invoke('projects:list'),
  version: process.versions.electron
});
