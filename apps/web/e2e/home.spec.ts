import { expect, test } from '@playwright/test';

test('home redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/logowanie/);
  await expect(page.getByRole('heading', { name: 'Logowanie' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zaloguj przez Discord' })).toBeVisible();
});

test('health route stays available', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});
