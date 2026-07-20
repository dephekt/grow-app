import { test, expect } from '@playwright/test';

// The page is a static calculator (no live data); drop the SSE stream so nothing hangs.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/events', (route) => route.abort('failed'));
});

test('mixing page calculates Athena Pro Line concentrate pours', async ({ page }) => {
  await page.goto('/mixing');

  const growBloom = page.getByTestId('dose-grow-bloom');
  const core = page.getByTestId('dose-core');

  // Default: Full tank (47.5 L) @ EC 3.0 → the known initial-fill preset.
  await expect(growBloom).toContainText('427.5');
  await expect(core).toContainText('256.5');

  // Refill (38 L) @ EC 3.0.
  await page.getByRole('button', { name: /^Refill/ }).click();
  await expect(growBloom).toContainText('342');
  await expect(core).toContainText('205.2');

  // Custom 1 L pitcher @ EC 1.0 (a chart point — no interpolation).
  await page.getByRole('button', { name: /^Custom/ }).click();
  await page.getByLabel('Custom litres').fill('1');
  await page.getByRole('button', { name: '1.0', exact: true }).click();
  await expect(growBloom).toContainText('2.7');
  await expect(core).toContainText('1.6');
});

test('mixing tab is active on the mixing route', async ({ page }) => {
  await page.goto('/mixing');
  await expect(page.getByRole('link', { name: 'MIXING' })).toHaveClass(/active/);
});
