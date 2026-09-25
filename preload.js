const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricsAPI', {
  startAuth: () => ipcRenderer.invoke('start-auth'),
  isAuthenticated: () => ipcRenderer.invoke('is-authenticated'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  onPlaybackUpdate: (callback) =>
    ipcRenderer.on('playback-update', (_e, data) => callback(data)),
  onAuthSuccess: (callback) => ipcRenderer.on('auth-success', callback),
  onAuthError: (callback) =>
    ipcRenderer.on('auth-error', (_e, msg) => callback(msg)),
  onAuthRequired: (callback) => ipcRenderer.on('auth-required', callback)
});
