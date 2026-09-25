const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const { shell } = require('electron');
const fetch = require('node-fetch');

const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

function base64URLEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(64));
}

function generateCodeChallenge(verifier) {
  return base64URLEncode(sha256(verifier));
}

/**
 * Runs the full Authorization Code + PKCE flow:
 * 1. Spins up a tiny local HTTP server to catch the redirect.
 * 2. Opens the user's default browser to Spotify's consent screen.
 * 3. Exchanges the returned code for an access/refresh token pair.
 */
async function authenticate({ clientId, redirectUri }) {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = base64URLEncode(crypto.randomBytes(16));

  const redirectUrl = new URL(redirectUri);
  const port = Number(redirectUrl.port) || 8888;

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES.join(' '),
    state
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, `http://${req.headers.host}`);
      if (reqUrl.pathname !== redirectUrl.pathname) {
        res.writeHead(404);
        res.end();
        return;
      }
      const returnedState = reqUrl.searchParams.get('state');
      const returnedCode = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error || returnedState !== state) {
        res.end('<h2>Authentication failed. You can close this tab.</h2>');
        server.close();
        reject(new Error(error || 'State mismatch'));
        return;
      }
      res.end('<h2>Spotify connected. You can close this tab and return to the app.</h2>');
      server.close();
      resolve(returnedCode);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. Another instance of this app (or a leftover ` +
          `login attempt) is likely still running. Close it, or find and stop whatever ` +
          `is using port ${port}, then try Connect again.`
        ));
        return;
      }
      reject(err);
    });

    // Only open the browser once the server is actually listening,
    // so the redirect always has somewhere to land.
    server.on('listening', () => {
      shell.openExternal(authUrl.toString()).catch(reject);
    });

    server.listen(port);
  });

  const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  });

  if (!tokenResp.ok) {
    throw new Error(`Token exchange failed: ${tokenResp.status} ${await tokenResp.text()}`);
  }

  const tokenData = await tokenResp.json();
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000
  };
}

async function refreshAccessToken({ clientId, refreshToken }) {
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  return {
    accessToken: data.access_token,
    // Spotify sometimes rotates the refresh token, sometimes doesn't
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000
  };
}

module.exports = { authenticate, refreshAccessToken };
