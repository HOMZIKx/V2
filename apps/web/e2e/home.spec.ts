import { expect, test } from '@playwright/test';

test('renders an account dashboard without assuming a character', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moje zespoły' })).toBeVisible();
  await expect(
    page.getByText('Konto nie musi należeć do zespołu ani mieć przypisanej postaci.'),
  ).toBeVisible();
  await expect(page.getByText('Set: Wojna')).not.toBeVisible();
});

test('opens the team workspace from the member dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Otwórz zespół/ }).click();

  await expect(page).toHaveURL(/\/teams\/asteria$/);
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stan postaci i zestawów' })).toBeVisible();
});

test('opens the separate character module from global navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Postacie' }).click();

  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole('heading', { name: 'Postacie', exact: true })).toBeVisible();
  await expect(page.getByText(/Postacie są osobnym modułem/)).toBeVisible();
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

test('opens the character equipment card from the team workspace', async ({ page }) => {
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Otwórz kartę EQ' }).click();

  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht$/);
  await expect(page.getByRole('heading', { name: 'NerwNicht', exact: true })).toBeVisible();
  await expect(page.getByText('Przedmioty', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Broń: Zatruty Miecz/ })).toBeVisible();
});

test('separates planned equipment, confirmed location and character timers', async ({ page }) => {
  await page.goto('/teams/asteria/characters/nerwnicht');

  await page.getByRole('button', { name: /Krótki Nóż/ }).click();
  await page.getByRole('button', { name: /Broń: Zatruty Miecz/ }).click();
  await expect(page.getByRole('button', { name: /Broń: Krótki Nóż/ })).toBeVisible();

  await page.locator('.catalog-item').filter({ hasText: 'Tarcza Bojowa +9' }).click();
  await page.getByRole('button', { name: /Potwierdź: jest na NerwNicht/ }).click();
  await expect(page.getByText('Mateusz · teraz')).toBeVisible();

  await page.getByRole('button', { name: 'Odwróć kartę i pokaż timery' }).click();
  await expect(page.getByText('Postęp postaci')).toBeVisible();
  await page.getByRole('button', { name: /Oznacz wykonane/ }).click();
  await expect(page.getByText('odliczanie rozpoczęte')).toBeVisible();
});

test('resolves a Discord identity before creating a team invitation', async ({ page }) => {
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Zarządzaj członkami' }).click();

  await expect(page).toHaveURL(/\/teams\/asteria\/members$/);
  await page.getByLabel('Discord ID osoby').fill('994001220033445566');
  await page.getByRole('button', { name: 'Sprawdź konto Discord' }).click();
  await expect(page.getByRole('heading', { name: 'Członkowie i zaproszenia' })).toBeVisible();
  await expect(page.getByLabel('Rozpoznane konto Discord').getByText('MobbynZS Oak')).toBeVisible();

  await page.getByRole('button', { name: 'Wyślij zaproszenie' }).click();
  await expect(page.getByText('MobbynZS Oak')).toBeVisible();
  await expect(page.getByText(/Oczekuje na akceptację/).last()).toBeVisible();
});

test('grants team access only after the recipient accepts', async ({ page }) => {
  await page.goto('/invitations/invitation-mobbynzs');

  await expect(page.getByText('Zalogowano przez Discord jako')).toBeVisible();
  await page.getByRole('button', { name: 'Akceptuję i dołączam' }).click();

  await expect(
    page.getByText('Dostęp do zespołu został przyznany po Twoim potwierdzeniu.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otwórz przestrzeń zespołu' })).toBeVisible();
});

test('shows append-only team history and resolves a revision conflict explicitly', async ({
  page,
}) => {
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Historia' }).click();

  await expect(page).toHaveURL(/\/teams\/asteria\/history$/);
  await expect(page.getByRole('heading', { name: 'Dziennik zmian' })).toBeVisible();
  await expect(page.getByText('Potwierdzono lokalizację tarczy')).toBeVisible();

  await page.getByLabel('Szukaj w historii').fill('księgi');
  await expect(page.getByText('Rozpoczęto timer księgi')).toBeVisible();
  await expect(page.getByText('Potwierdzono lokalizację tarczy')).not.toBeVisible();

  await page.getByLabel('Szukaj w historii').fill('');
  await page.getByRole('button', { name: 'Zachowaj mój szkic' }).click();
  await expect(page.getByText('Konflikt obsłużony')).toBeVisible();
  await expect(page.getByText(/nie publikuje go automatycznie/i)).not.toBeVisible();
});

test('creates a character profile without inventing equipment', async ({ page }) => {
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Dodaj postać' }).click();

  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/new$/);
  await page.getByLabel('Nazwa postaci').fill('NowaSura');
  await page.getByLabel('Poziom opcjonalnie').fill('42');
  await page.getByRole('button', { name: 'Utwórz postać' }).click();

  await expect(page.getByRole('heading', { name: 'NowaSura' })).toBeVisible();
  await expect(page.getByText('Utworzono profil oraz pusty zestaw „Główny”.')).toBeVisible();
});

test('edits an existing character through a versioned profile form', async ({ page }) => {
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page.getByRole('link', { name: 'Edytuj postać' }).click();

  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht\/edit$/);
  await page.getByLabel('Notatka zespołu opcjonalnie').fill('Główna postać na wojnę.');
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(page.getByText('Profil zaktualizowany')).toBeVisible();
});
