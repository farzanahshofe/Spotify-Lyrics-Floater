const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const { authenticate, refreshAccessToken } = require('./src/spotifyAuth');
const { startPolling } = require('./src/spotifyApi');
const { fetchLyrics } = require('./src/lyrics');

let config;
try {
  config = require('./config.json');
} catch (e) {
  console.error('Missing config.json. Copy config.example.json to config.json and fill in your Spotify Client ID.');
  app.quit();
}

const store = new Store({ name: 'auth', encryptionKey: 'lyrics-floater-local-store' });

let mainWindow = null;
let tray = null;
let stopPolling = null;
let lyricsCache = new Map(); // trackId -> lyrics result

function getAccessToken() {
  const tokens = store.get('tokens');
  if (!tokens) throw { code: 'NOT_AUTHENTICATED' };

  if (Date.now() < tokens.expiresAt - 30000) {
    return tokens.accessToken;
  }
  return refreshAccessToken({ clientId: config.spotifyClientId, refreshToken: tokens.refreshToken })
    .then((fresh) => {
      store.set('tokens', fresh);
      return fresh.accessToken;
    });
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const savedBounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 420,
    height: savedBounds?.height || 220,
    x: savedBounds?.x ?? screenW - 440,
    y: savedBounds?.y ?? 40,
    minWidth: 240,
    minHeight: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Click-through by default: clicks/scrolls pass to whatever's behind the
  // pane. { forward: true } still delivers mousemove events to the renderer
  // so it can detect when the cursor is over an interactive zone (drag bar,
  // buttons, lyrics area) and temporarily re-enable mouse capture there.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Persist position/size so the pane reopens where you left it
  const saveBounds = () => store.set('windowBounds', mainWindow.getBounds());
  mainWindow.on('moved', saveBounds);
  mainWindow.on('resized', saveBounds);

  // "Closing" the window just hides it — the app itself stays running in the tray,
  // matching the "quit from the tray app" behavior you asked for.
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(icon);
  tray.setToolTip('Spotify Lyrics Floater');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide Lyrics',
      click: () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      }
    },
    {
      label: 'Connect Spotify',
      click: () => handleAuth()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

let authInProgress = false;

async function handleAuth() {
  if (authInProgress) {
    mainWindow.webContents.send('auth-error', 'A login attempt is already in progress — check your browser for the Spotify tab.');
    return;
  }
  authInProgress = true;
  try {
    const tokens = await authenticate({
      clientId: config.spotifyClientId,
      redirectUri: config.redirectUri
    });
    store.set('tokens', tokens);
    mainWindow.webContents.send('auth-success');
    beginPollingLoop();
  } catch (err) {
    mainWindow.webContents.send('auth-error', String(err.message || err));
  } finally {
    authInProgress = false;
  }
}

function beginPollingLoop() {
  if (stopPolling) stopPolling();

  stopPolling = startPolling({
    getAccessToken,
    intervalMs: config.pollIntervalMs || 1000,
    onUpdate: async (track) => {
      if (!track) {
        mainWindow.webContents.send('playback-update', { track: null });
        return;
      }

      let lyrics = lyricsCache.get(track.id);
      if (lyrics === undefined) {
        try {
          lyrics = await fetchLyrics({
            title: track.title,
            artist: track.artist,
            album: track.album,
            durationMs: track.durationMs
          });
        } catch (e) {
          lyrics = null;
        }
        lyricsCache.set(track.id, lyrics);
      }

      mainWindow.webContents.send('playback-update', { track, lyrics });
    },
    onError: (err) => {
      if (err && err.code === 'TOKEN_EXPIRED') {
        mainWindow.webContents.send('auth-required');
      } else if (err && err.code === 'NOT_AUTHENTICATED') {
        mainWindow.webContents.send('auth-required');
      } else {
        console.error('Polling error:', err);
      }
    }
  });
}

ipcMain.handle('start-auth', () => handleAuth());
ipcMain.handle('is-authenticated', () => !!store.get('tokens'));
ipcMain.on('set-ignore-mouse-events', (_e, ignore) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  if (store.get('tokens')) beginPollingLoop();
});

app.on('window-all-closed', (e) => {
  // Keep running in the tray on all platforms (including macOS) —
  // matches the "must quit via the tray app" behavior requested.
  e.preventDefault();
});
