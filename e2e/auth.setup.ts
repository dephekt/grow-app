import { expect, test as setup } from '@playwright/test';

const authFile = '.playwright/state.json';

// Log in as the seeded local admin through the real login form and persist the
// resulting session cookie for the app projects to reuse.
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('e2e-admin');
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByLabel('Account menu')).toBeVisible();
  await page.context().storageState({ path: authFile });
});
