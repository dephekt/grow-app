import { defineConfig, devices } from '@playwright/test';

// The setup project logs in through the real UI and writes a storage state that
// the app projects reuse, so existing dashboard/camera/screenshot specs run
// authenticated. Auth-flow specs opt out per-file with a clean storage state.
const authFile = '.playwright/state.json';

export default defineConfig({
  testDir: './e2e',
  webServer: {
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
      // Auth-flow specs log in fresh in every test across three parallel projects,
      // all from 127.0.0.1 — well past the production default within one window.
      // Raise the per-IP login cap so the throttle still runs (happy path stays
      // covered) but doesn't 429 the suite's own logins. Its limiting behaviour is
      // unit-tested in login-throttle.test.ts.
      GROW_AUTH_LOGIN_RATE_MAX: '1000'
    }
  },
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
