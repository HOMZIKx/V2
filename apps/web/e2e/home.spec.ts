import { expect, test } from '@playwright/test';

test('renders the technical status page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('V2 Web is running')).toBeVisible();
});
