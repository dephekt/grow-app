import { defineConfig, devices } from '@playwright/test';

// The setup project logs in through the real UI and writes a storage state that
// the app projects reuse, so existing dashboard/camera/screenshot specs run
// authenticated. Auth-flow specs opt out per-file with a clean storage state.
const authFile = '.playwright/state.json';

export default defineConfig({
  testDir: './e2e',
  webServer: [
    {
      // A mock OpenID Provider so the OIDC flow can be driven end-to-end without a
      // live Keycloak. Serves discovery, JWKS, a login form, and a signed ID token.
      command: 'node e2e/support/mock-oidc-provider.mjs',
      url: 'http://127.0.0.1:4571/.well-known/openid-configuration',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        PORT: '4571',
        ISSUER: 'http://127.0.0.1:4571',
        CLIENT_ID: 'grow-e2e'
      }
    },
    {
      // Seed a local admin via the product's own bootstrap env (no test-only auth
      // bypass). The auth DB is ephemeral and reset each run.
      command: 'rm -f .playwright/auth.db* && pnpm build && pnpm preview --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        GROW_AUTH_DB: '.playwright/auth.db',
        GROW_AUTH_ADMIN_USERNAME: 'e2e-admin',
        GROW_AUTH_ADMIN_PASSWORD: 'e2e-password',
        // Point the app at the mock OP so the "Sign in with SSO" path is live. The
        // insecure-issuer flag is required because the mock runs over plain HTTP.
        GROW_SITE: 'daniel-home',
        GROW_OIDC_ISSUER: 'http://127.0.0.1:4571',
        GROW_OIDC_CLIENT_ID: 'grow-e2e',
        GROW_OIDC_CLIENT_SECRET: 'e2e-secret',
        GROW_OIDC_ALLOW_INSECURE_ISSUER: 'true',
        GROW_AUTH_ORIGINS: 'http://127.0.0.1:4173',
        // Auth-flow specs log in fresh in every test across three parallel projects,
        // all from 127.0.0.1 — well past the production defaults within one window.
        // Raise the per-IP cap and disable the concurrent-derivation cap so the
        // throttle still runs (happy path stays covered) but neither 429s the suite's
        // own logins: on a many-worker CI box more than 8 logins can be mid-scrypt at
        // once, which would otherwise flake on the in-flight cap. Its limiting
        // behaviour is unit-tested in login-throttle.test.ts.
        GROW_AUTH_LOGIN_RATE_MAX: '1000',
        GROW_AUTH_LOGIN_MAX_INFLIGHT: '0'
      }
    }
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup']
    },
    {
      name: 'tab5',
      use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, storageState: authFile },
      dependencies: ['setup']
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], storageState: authFile },
      dependencies: ['setup']
    }
  ]
});
