import { expect, test } from '@playwright/test';

test('renders the Control Center dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Pulpit' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'V2 Control Center' })).toBeVisible();
});

test('navigates to activity overview smoke', async ({ page }) => {
  await page.goto('/activity');

  await expect(page.getByRole('heading', { name: 'Przegląd aktywności' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'V2 Control Center' })).toBeVisible();
});
