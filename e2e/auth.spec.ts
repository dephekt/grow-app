import { expect, test, type Page } from '@playwright/test';

// These specs exercise the auth wall itself, so they start from a clean
// (unauthenticated) storage state rather than the shared logged-in one.
test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('redirects an unauthenticated visitor to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('rejects a wrong password and stays on the login page', async ({ page }) => {
  await login(page, 'e2e-admin', 'not-the-password');
  await expect(page.getByRole('alert')).toContainText(/invalid/i);
  await expect(page).toHaveURL(/\/login/);
});

test('logs in with the seeded admin and then logs out', async ({ page }) => {
  await login(page, 'e2e-admin', 'e2e-password');
  await expect(page.getByLabel('Account menu')).toBeVisible();

  await page.getByLabel('Account menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('changes the local password via the account menu', async ({ page }) => {
  await login(page, 'e2e-admin', 'e2e-password');
  await expect(page.getByLabel('Account menu')).toBeVisible();

  await page.getByLabel('Account menu').click();
  await page.getByRole('menuitem', { name: 'Change local password' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Current password').fill('e2e-password');
  // Re-set to the same password so other specs' logins keep working.
  await dialog.getByLabel('New password', { exact: true }).fill('e2e-password');
  await dialog.getByLabel('Confirm new password').fill('e2e-password');
  await dialog.getByRole('button', { name: 'Save password' }).click();

  await expect(dialog.getByText('Password saved')).toBeVisible();
});

test('admin can create a local user from the users page', async ({ page }, testInfo) => {
  await login(page, 'e2e-admin', 'e2e-password');
  await expect(page.getByLabel('Account menu')).toBeVisible();

  await page.goto('/settings/users');
  await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'e2e-admin' })).toBeVisible();

  // Unique per project: all three browser projects share the webServer's auth
  // DB and run in parallel, so a fixed username races to a 409.
  const username = `guest-${testInfo.project.name}`;

  // Scope to the create form — "Password" also matches the account dialog's
  // password fields elsewhere in the DOM.
  const form = page.locator('.new-user');
  await form.getByLabel('Username').fill(username);
  await form.getByLabel('Password').fill('guest-password');
  await form.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('cell', { name: username })).toBeVisible();
});

test('serves /health without authentication', async ({ request }) => {
  const response = await request.get('/health', { maxRedirects: 0 });
  // Public: no redirect to /login. 200 when the broker is up, 503 in CI where it
  // isn't — either way it's the health endpoint answering, not the auth wall.
  expect([200, 503]).toContain(response.status());
});
