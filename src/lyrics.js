const fetch = require('node-fetch');

/**
 * Parses standard LRC format ("[mm:ss.xx]line text") into
 * an array of { timeMs, text }, sorted by time.
 */
function parseLRC(lrcString) {
  const lines = lrcString.split('\n');
  const timeTag = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const result = [];

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(timeTag)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(timeTag, '').trim();
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const fraction = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      const timeMs = minutes * 60000 + seconds * 1000 + fraction;
      result.push({ timeMs, text });
    }
  }

  result.sort((a, b) => a.timeMs - b.timeMs);
  return result;
}

/**
 * Looks up synced lyrics on lrclib.net for a given track.
 * Returns { synced: [{timeMs, text}], plain: string } or null if not found.
 * lrclib is free, open, and requires no API key.
 */
async function fetchLyrics({ title, artist, album, durationMs }) {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist
  });
  if (album) params.set('album_name', album);
  if (durationMs) params.set('duration', String(Math.round(durationMs / 1000)));

  const resp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
    headers: { 'User-Agent': 'spotify-lyrics-floater (personal use)' }
  });

  if (resp.status === 404) {
    // Fall back to the search endpoint, which is more forgiving about exact matches
    return fetchLyricsBySearch({ title, artist });
  }
  if (!resp.ok) throw new Error(`lrclib error: ${resp.status}`);

  const data = await resp.json();
  return normalizeLrclibResult(data);
}

async function fetchLyricsBySearch({ title, artist }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const resp = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
    headers: { 'User-Agent': 'spotify-lyrics-floater (personal use)' }
  });
  if (!resp.ok) return null;

  const results = await resp.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return normalizeLrclibResult(results[0]);
}

function normalizeLrclibResult(data) {
  if (!data) return null;
  if (data.instrumental) {
    return { synced: [], plain: '(Instrumental)', instrumental: true };
  }
  if (data.syncedLyrics) {
    return { synced: parseLRC(data.syncedLyrics), plain: data.plainLyrics || '' };
  }
  if (data.plainLyrics) {
    return { synced: [], plain: data.plainLyrics };
  }
  return null;
}

module.exports = { fetchLyrics, parseLRC };
