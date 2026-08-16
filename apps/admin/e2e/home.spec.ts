import { expect, test } from '@playwright/test';

test('renders the technical status screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'V2 Admin is running' })).toBeVisible();
});

test('navigates to activity overview smoke', async ({ page }) => {
  await page.goto('/activity');

  await expect(page.getByRole('heading', { name: 'Centrum Aktywności — Overview' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
});
