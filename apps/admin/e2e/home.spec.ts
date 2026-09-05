import { expect, test } from '@playwright/test';

test('renders the Technician status shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'V2 Admin is running' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Nawigacja Technika' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Status' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Konfiguracja bota' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Diagnostyka' })).toBeVisible();
});
