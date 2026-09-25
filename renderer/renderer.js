const trackInfoEl = document.getElementById('track-info');
const connectBtn = document.getElementById('connect-btn');
const hideBtn = document.getElementById('hide-btn');
const lockToggle = document.getElementById('lock-toggle');
const linesEl = document.getElementById('lyrics-lines');
const emptyEl = document.getElementById('lyrics-empty');

// --- Click-through handling ---------------------------------------------
// By default the window ignores mouse events (clicks pass to whatever's
// behind it), and only becomes interactive when the cursor hovers an
// ".interactive-zone" element (drag bar, buttons, lyrics area for
// scrolling). Flipping the Lock switch turns that off and makes the whole
// pane interactive everywhere, so you can freely move/resize/click without
// hunting for a hover zone.
let locked = false;
let mouseIsCaptured = false;

function applyMouseMode() {
  if (locked) {
    window.lyricsAPI.setIgnoreMouseEvents(false);
  } else {
    mouseIsCaptured = false;
    window.lyricsAPI.setIgnoreMouseEvents(true);
  }
}

lockToggle.addEventListener('change', () => {
  locked = lockToggle.checked;
  document.body.classList.toggle('locked', locked);
  applyMouseMode();
});

document.addEventListener('mousemove', (e) => {
  if (locked) return; // already fully interactive; skip hover detection
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overInteractive = !!(el && el.closest('.interactive-zone'));
  if (overInteractive !== mouseIsCaptured) {
    mouseIsCaptured = overInteractive;
    window.lyricsAPI.setIgnoreMouseEvents(!overInteractive);
  }
});
document.addEventListener('mouseleave', () => {
  if (locked) return;
  mouseIsCaptured = false;
  window.lyricsAPI.setIgnoreMouseEvents(true);
});
// -------------------------------------------------------------------------

let currentSynced = [];
let currentTrackId = null;
let lastProgressMs = 0;
let lastFetchedAt = 0;
let lastIsPlaying = false;
let tickTimer = null;

connectBtn.addEventListener('click', () => window.lyricsAPI.startAuth());
hideBtn.addEventListener('click', () => window.close());

window.lyricsAPI.onAuthSuccess(() => {
  connectBtn.textContent = 'Connected';
  connectBtn.disabled = true;
});

window.lyricsAPI.onAuthRequired(() => {
  trackInfoEl.textContent = 'Session expired — reconnect';
  connectBtn.textContent = 'Reconnect';
  connectBtn.disabled = false;
});

window.lyricsAPI.onAuthError((msg) => {
  trackInfoEl.textContent = `Auth failed: ${msg}`;
});

window.lyricsAPI.isAuthenticated().then((authed) => {
  if (authed) {
    connectBtn.textContent = 'Connected';
    connectBtn.disabled = true;
  }
});

window.lyricsAPI.onPlaybackUpdate(({ track, lyrics }) => {
  if (!track) {
    trackInfoEl.textContent = 'Nothing playing';
    showEmpty('Play something on Spotify to see lyrics here.');
    currentTrackId = null;
    return;
  }

  trackInfoEl.textContent = `${track.title} — ${track.artist}`;
  lastProgressMs = track.progressMs;
  lastFetchedAt = track.fetchedAt;
  lastIsPlaying = track.isPlaying;

  if (track.id !== currentTrackId) {
    currentTrackId = track.id;
    renderLyrics(lyrics);
  }

  restartClock();
});

function renderLyrics(lyrics) {
  linesEl.innerHTML = '';

  if (!lyrics || (lyrics.synced.length === 0 && !lyrics.plain)) {
    currentSynced = [];
    showEmpty('No lyrics found for this track.');
    return;
  }

  if (lyrics.instrumental) {
    currentSynced = [];
    showEmpty('Instrumental — no lyrics.');
    return;
  }

  if (lyrics.synced.length > 0) {
    currentSynced = lyrics.synced;
    hideEmpty();
    for (const line of lyrics.synced) {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.textContent = line.text || '\u266A';
      linesEl.appendChild(div);
    }
  } else {
    // Plain, unsynced lyrics as a fallback
    currentSynced = [];
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'lyric-line active';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = lyrics.plain;
    linesEl.appendChild(div);
  }
}

function showEmpty(msg) {
  emptyEl.textContent = msg;
  emptyEl.style.display = 'block';
  linesEl.innerHTML = '';
}

function hideEmpty() {
  emptyEl.style.display = 'none';
}

function restartClock() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(updateActiveLine, 250);
  updateActiveLine();
}

function updateActiveLine() {
  if (currentSynced.length === 0) return;

  const elapsedSinceFetch = lastIsPlaying ? Date.now() - lastFetchedAt : 0;
  const estimatedPositionMs = lastProgressMs + elapsedSinceFetch;

  let activeIndex = -1;
  for (let i = 0; i < currentSynced.length; i++) {
    if (currentSynced[i].timeMs <= estimatedPositionMs) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const lineEls = linesEl.querySelectorAll('.lyric-line');
  lineEls.forEach((el, i) => el.classList.toggle('active', i === activeIndex));

  if (activeIndex >= 0 && lineEls[activeIndex]) {
    lineEls[activeIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
