# Spotify Lyrics Floater

A small always-on-top desktop app (Electron) that shows synced lyrics for whatever
is currently playing on Spotify, floating over your other windows. Move and resize
the pane freely; it stays on top of everything else. Closing the window just hides
it — quit for real from the tray icon.

## How it works

- **Auth**: Spotify OAuth (Authorization Code + PKCE) — no client secret needed,
  safe for a desktop app.
- **Now playing**: polls the Spotify Web API's `currently-playing` endpoint every
  ~1 second.
- **Lyrics**: fetched at runtime from [lrclib.net](https://lrclib.net) (free, open,
  synced LRC-format lyrics, no API key required).
- **Sync**: the current playback position is compared against each lyric line's
  timestamp to highlight the active line.

## Setup

1. **Create a Spotify Developer app**
   - Go to https://developer.spotify.com/dashboard and log in.
   - Click "Create app".
   - Set **Redirect URI** to exactly: `http://127.0.0.1:8888/callback`
   - Save, then copy the **Client ID** shown on the app's dashboard page.

2. **Configure this project**
   ```bash
   cp config.example.json config.json
   ```
   Open `config.json` and paste your Client ID into `spotifyClientId`.

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Run it**
   ```bash
   npm start
   ```
   Click **Connect** in the pane's title bar — this opens your default browser to
   Spotify's consent screen. Approve it, and the app will start polling.

5. **Package it as a standalone app (optional)**
   ```bash
   npm run dist
   ```
   This uses `electron-builder` to produce a `.dmg` / `.exe` / `.AppImage` in `dist/`.

## Using it

- **Move**: drag the top title bar.
- **Resize**: drag any edge/corner of the window (standard OS resize).
- **Hide**: click the `–` button, or the tray icon — the app keeps running.
- **Show again**: click the tray icon.
- **Quit for real**: right-click the tray icon → Quit.

## Notes & limitations

- Spotify's official API doesn't provide lyrics, so this relies on lrclib.net's
  community database. Some tracks (especially very new or obscure releases) may
  not have synced lyrics available yet — the app falls back to plain (unsynced)
  lyrics, or shows "No lyrics found."
- The access token is short-lived; the app automatically refreshes it in the
  background using the stored refresh token.
- Tokens are stored locally via `electron-store` (in your OS's app-data folder),
  not synced anywhere.
- This polls the API roughly once a second — well within Spotify's rate limits
  for personal use, but don't drop `pollIntervalMs` drastically lower.

## Project structure

```
spotify-lyrics-floater/
├── main.js              # Electron main process: window, tray, IPC
├── preload.js            # Safe bridge between main and renderer
├── config.example.json   # Copy to config.json and fill in your Client ID
├── src/
│   ├── spotifyAuth.js    # PKCE OAuth flow
│   ├── spotifyApi.js     # Polls currently-playing endpoint
│   └── lyrics.js          # Fetches + parses LRC lyrics from lrclib.net
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── renderer.js         # Sync logic + UI wiring
└── assets/
    └── tray-icon.png
```
