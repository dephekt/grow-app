// Minimal mock OpenID Provider for the OIDC e2e test. Serves discovery, JWKS, an
// /authorize login form, and a /token endpoint that returns an RS256-signed ID
// token. No external deps (node:crypto + node:http) so it needs nothing hoisted.
//
// The "user" typed into the login form determines the group claims, which is how
// the e2e drives the authorized vs. denied paths:
//   greg     -> /grow/sites/daniel-home  (authorized as a normal user)
//   boss     -> /grow/admin              (authorized as admin)
//   anyone   -> no groups                (denied by group authz)
import { createServer } from 'node:http';
import { generateKeyPairSync, sign as cryptoSign, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4571);
const ISSUER = process.env.ISSUER ?? `http://127.0.0.1:${PORT}`;
const CLIENT_ID = process.env.CLIENT_ID ?? 'grow-e2e';
const KID = 'mock-op-key-1';

// generateKeyPairSync returns KeyObjects when no encoding is given — usable
// directly by sign()/export() with no further conversion.
const { publicKey, privateKey: signingKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

// code -> { nonce, claims, redirectUri }
const pending = new Map();

const b64url = (input) => Buffer.from(input).toString('base64url');

function signIdToken(claims, nonce) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const payload = { iss: ISSUER, aud: CLIENT_ID, iat: now, exp: now + 300, nonce, ...claims };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), signingKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function groupsFor(username) {
  if (username === 'greg') return ['/grow/sites/daniel-home'];
  if (username === 'boss') return ['/grow/admin'];
  return [];
}

function claimsFor(username) {
  return {
    sub: `${username}-sub`,
    preferred_username: username,
    name: username.charAt(0).toUpperCase() + username.slice(1),
    email: `${username}@example.com`,
    groups: groupsFor(username)
  };
}

function send(res, status, contentType, body) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);

  if (url.pathname === '/.well-known/openid-configuration') {
    return send(res, 200, 'application/json', JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce', 'preferred_username', 'name', 'email', 'groups']
    }));
  }

  if (url.pathname === '/jwks') {
    return send(res, 200, 'application/json', JSON.stringify({ keys: [jwk] }));
  }

  // Render a tiny login form that carries the flow params forward.
  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const nonce = url.searchParams.get('nonce') ?? '';
    const html = `<!doctype html><html><body><h1>Mock IdP</h1>
      <form method="GET" action="/authorize/continue">
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="state" value="${state}" />
        <input type="hidden" name="nonce" value="${nonce}" />
        <label>Username <input name="username" autocomplete="username" /></label>
        <button type="submit">Continue</button>
      </form></body></html>`;
    return send(res, 200, 'text/html', html);
  }

  if (url.pathname === '/authorize/continue') {
    const redirectUri = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const nonce = url.searchParams.get('nonce') ?? '';
    const username = (url.searchParams.get('username') ?? '').trim() || 'anonymous';
    const code = randomUUID();
    pending.set(code, { nonce, claims: claimsFor(username), redirectUri });

    const dest = new URL(redirectUri);
    dest.searchParams.set('code', code);
    if (state) dest.searchParams.set('state', state);
    res.writeHead(302, { location: dest.href });
    return res.end();
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    const code = params.get('code') ?? '';
    const entry = pending.get(code);
    if (!entry) return send(res, 400, 'application/json', JSON.stringify({ error: 'invalid_grant' }));
    pending.delete(code); // single-use

    const idToken = signIdToken(entry.claims, entry.nonce);
    return send(res, 200, 'application/json', JSON.stringify({
      access_token: randomUUID(),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken,
      scope: 'openid profile email'
    }));
  }

  send(res, 404, 'text/plain', 'not found');
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-oidc] listening on ${ISSUER}`);
});
