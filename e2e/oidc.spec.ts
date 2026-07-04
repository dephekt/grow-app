import { expect, test } from '@playwright/test';

// Exercises the OIDC auth-code flow against the mock OpenID Provider configured in
// playwright.config.ts. Starts unauthenticated (its own clean storage state).
test.use({ storageState: { cookies: [], origins: [] } });

test('shows the SSO button when OIDC is configured', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Sign in with SSO' })).toBeVisible();
});

test('signs in via OIDC when the user is in the site group', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Sign in with SSO' }).click();

  // On the mock IdP login form: "greg" carries /grow/sites/daniel-home.
  await expect(page.getByRole('heading', { name: 'Mock IdP' })).toBeVisible();
  await page.getByLabel('Username').fill('greg');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Back on grow-app, authenticated and provisioned.
  await expect(page.getByLabel('Account menu')).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
});

test('rejects an OIDC user without an authorized group', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Sign in with SSO' }).click();

  // "outsider" is in no grow group, so the callback bounces back forbidden.
  await page.getByLabel('Username').fill('outsider');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/login\?error=forbidden/);
  await expect(page.getByRole('alert')).toContainText(/authorized/i);
  await expect(page.getByLabel('Account menu')).toHaveCount(0);
});
