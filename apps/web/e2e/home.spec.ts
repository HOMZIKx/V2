import { expect, test } from '@playwright/test';

test('login page is reachable without a session', async ({ page }) => {
  await page.goto('/logowanie');

  await expect(page.getByRole('heading', { name: 'V2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zaloguj przez Discord' })).toBeVisible();
});

test('home redirects unauthenticated users toward login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/logowanie/);
  await expect(page.getByRole('heading', { name: 'V2' })).toBeVisible();
});

test('health route stays available', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
});
