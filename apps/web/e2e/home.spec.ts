import { expect, test } from '@playwright/test';

test('renders the member command surface', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Witaj ponownie/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Do zrobienia teraz' })).toBeVisible();
  await expect(page.getByText('Set: Wojna')).toBeVisible();
});

test('keeps a reminder change explicit and human-confirmed', async ({ page }) => {
  await page.goto('/');

  const medalCard = page.locator('article').filter({ hasText: 'Medal konny' });
  await medalCard.getByRole('button', { name: 'Zrobione' }).click();

  await expect(medalCard.getByText('Zrobione', { exact: true })).toBeVisible();
  await expect(page.getByText('Medal konny dla Aalpsik: oznaczono jako zrobione.')).toBeAttached();
});
