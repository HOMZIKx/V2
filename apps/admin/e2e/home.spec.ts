import { expect, test } from '@playwright/test';

test('renders the technical status screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'V2 Admin is running' })).toBeVisible();
});
