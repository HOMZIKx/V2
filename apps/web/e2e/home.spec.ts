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

test('opens the team workspace from the member dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Otwórz przestrzeń zespołu/ }).click();

  await expect(page).toHaveURL(/\/teams\/asteria$/);
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stan postaci i zestawów' })).toBeVisible();
});

test('keeps team actions and notes explicit', async ({ page }) => {
  await page.goto('/teams/asteria');

  const task = page.locator('article').filter({ hasText: 'Potwierdź lokalizację tarczy' });
  await task.getByRole('button', { name: 'Zrobione' }).click();
  await expect(task.getByText('Zrobione', { exact: true })).toBeVisible();

  await page.getByLabel('Nowa notatka').fill('Sprawdzić tarczę przed wojną.');
  await page.getByRole('button', { name: 'Dodaj notatkę' }).click();
  await expect(page.getByText('Sprawdzić tarczę przed wojną.')).toBeVisible();
});
