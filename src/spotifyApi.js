const fetch = require('node-fetch');

/**
 * Fetches what's currently playing on the user's Spotify account.
 * Returns null if nothing is playing, or a normalized track object.
 */
async function getCurrentlyPlaying(accessToken) {
  const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (resp.status === 204) return null; // nothing playing
  if (resp.status === 401) throw { code: 'TOKEN_EXPIRED' };
  if (!resp.ok) throw new Error(`Spotify API error: ${resp.status}`);

  const data = await resp.json();
  if (!data || !data.item) return null;

  return {
    id: data.item.id,
    title: data.item.name,
    artist: data.item.artists.map((a) => a.name).join(', '),
    album: data.item.album?.name || '',
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms,
    isPlaying: data.is_playing,
    fetchedAt: Date.now()
  };
}

/**
 * Starts a polling loop. Calls onUpdate(track|null) on every tick,
 * and onError(err) if a request fails (e.g. expired token).
 * Returns a stop() function.
 */
function startPolling({ getAccessToken, intervalMs = 1000, onUpdate, onError }) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const token = await getAccessToken();
      const track = await getCurrentlyPlaying(token);
      onUpdate(track);
    } catch (err) {
      onError(err);
    } finally {
      if (!stopped) setTimeout(tick, intervalMs);
    }
  }

  tick();
  return () => {
    stopped = true;
  };
}

module.exports = { getCurrentlyPlaying, startPolling };
