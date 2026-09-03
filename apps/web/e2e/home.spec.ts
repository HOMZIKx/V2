import { expect, test, type Page } from '@playwright/test';

async function seedAuthenticatedDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Kontynuuj z Discord/i }).click();
  await page.getByRole('button', { name: /Wczytaj przykładowe Asteria/i }).click();
  await expect(page.getByRole('heading', { name: /Witaj/ })).toBeVisible({ timeout: 10_000 });
}

test('shows Discord entry before access', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wejdź przez Discord' })).toBeVisible();
  await page.getByRole('button', { name: 'Kontynuuj z Discord' }).click();
  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole('heading', { name: 'Utwórz swoją przestrzeń' })).toBeVisible();
});

test('creates a workspace from first-use', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kontynuuj z Discord' }).click();
  await expect(page.getByRole('heading', { name: 'Utwórz swoją przestrzeń' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByPlaceholder('np. Moja przestrzeń').fill('SoloTest');
  await page.getByRole('button', { name: 'Utwórz przestrzeń' }).click();
  await expect(page.getByRole('heading', { name: 'Moje przestrzenie' })).toBeVisible();
  await page.locator('.workspace-list a').first().click();
  await expect(page.getByRole('heading', { name: 'SoloTest', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dodaj pierwszą postać' })).toBeVisible();
});

test('opens seeded team workspace from the member dashboard', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible();
  await page.locator('.workspace-list a[href="/teams/asteria"]').click();
  await expect(page).toHaveURL(/\/teams\/asteria$/);
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Postacie i sety' })).toBeVisible();
});

test('opens the separate character module from global navigation', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Główna nawigacja' })
    .getByRole('link', { name: 'Postacie' })
    .click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole('heading', { name: 'Postacie', exact: true })).toBeVisible();
  await expect(
    page
      .getByText('Lista postaci z Twoich przestrzeni', {
        exact: false,
      })
      .first(),
  ).toBeVisible();
});

test('keeps team actions and notes explicit', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria');
  const task = page.locator('article').filter({ hasText: 'Potwierdź lokalizację tarczy' });
  await task.getByRole('button', { name: 'Zrobione' }).click();
  await expect(task.getByText('Zrobione', { exact: true })).toBeVisible();
  await page.getByLabel('Nowa notatka').fill('Sprawdzić tarczę przed wojną.');
  await page.getByRole('button', { name: 'Dodaj notatkę' }).click();
  await expect(page.getByText('Sprawdzić tarczę przed wojną.')).toBeVisible();
});

test('opens the character equipment card from the team workspace', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Otwórz kartę EQ' }).first().click();
  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht$/);
  await expect(page.getByRole('heading', { name: 'NerwNicht', exact: true })).toBeVisible();
  await expect(page.getByText('Baza EQ zespołu', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Broń: Demoniczne Ostrze/ })).toBeVisible();
});

test('separates planned equipment, confirmed location and character timers', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page.getByLabel('Pokaż też karty innych klas').check();
  await page.locator('.catalog-item').filter({ hasText: 'Krótki Nóż +9' }).click();
  await page.getByRole('button', { name: /Broń: Demoniczne Ostrze/ }).click();
  await expect(
    page.locator('.entry-status').filter({ hasText: /nie pasuje do klasy Sura/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Broń: Demoniczne Ostrze/ })).toBeVisible();
  await page.locator('.catalog-item').filter({ hasText: 'Bojowa Tarcza +9' }).click();
  await page.getByRole('button', { name: /Potwierdź: jest na NerwNicht/ }).click();
  await expect(page.getByText(/Mateusz · teraz/)).toBeVisible();
  await page.getByLabel('Nazwa nowego przedmiotu').fill('Lwi Miecz');
  await page.getByLabel('Ulepszenie').selectOption('4');
  await page.getByRole('button', { name: 'Dodaj kartę' }).click();
  await expect(page.locator('.entry-status').filter({ hasText: 'Lwi Miecz +4' })).toBeVisible();
  await expect(page.locator('.catalog-item').filter({ hasText: 'Lwi Miecz +4' })).toBeVisible();
  await page.getByRole('button', { name: 'Odwróć kartę i pokaż timery' }).click();
  await expect(page.getByText('Postęp Projekt Hard')).toBeVisible();
});

test('resolves a Discord identity before creating a team invitation', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Zarządzaj członkami' }).click();
  await expect(page).toHaveURL(/\/teams\/asteria\/members$/);
  await page.getByLabel('Discord ID osoby').fill('994001220033445566');
  await page.getByRole('button', { name: 'Sprawdź konto Discord' }).click();
  await expect(page.getByRole('heading', { name: 'Członkowie i zaproszenia' })).toBeVisible();
  await expect(page.getByText('MobbynZS Oak').first()).toBeVisible();
  await page.getByRole('button', { name: 'Wyślij zaproszenie' }).click();
  await expect(page.getByText(/Oczekuje na akceptację/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Otwórz link zaproszenia/ })).toBeVisible();
});

test('blocks accepting an invitation addressed to someone else', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/invitations/invitation-mobbynzs');
  await expect(page.getByText('Zalogowano jako')).toBeVisible();
  await expect(page.getByText(/To zaproszenie jest dla/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Akceptuję i dołączam' })).toHaveCount(0);
});

test('shows append-only team history and resolves a revision conflict explicitly', async ({
  page,
}) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Historia' }).click();
  await expect(page).toHaveURL(/\/teams\/asteria\/history$/);
  await expect(page.getByRole('heading', { name: 'Dziennik zmian' })).toBeVisible();
  await expect(page.getByText('Potwierdzono lokalizację tarczy')).toBeVisible();
  await page.getByLabel('Szukaj w historii').fill('księgi');
  await expect(page.getByText('Rozpoczęto timer księgi')).toBeVisible();
  await expect(page.getByText('Potwierdzono lokalizację tarczy')).not.toBeVisible();
  await page.getByLabel('Szukaj w historii').fill('');
  await page.getByText('Symulator konfliktu rewizji').click();
  await page.getByRole('button', { name: 'Zachowaj mój szkic' }).click();
  await expect(page.getByText('Konflikt obsłużony')).toBeVisible();
});

test('loads demo Asteria from the home dashboard button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kontynuuj z Discord' }).click();
  await expect(page.getByRole('heading', { name: 'Utwórz swoją przestrzeń' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Wczytaj przykładowe Asteria (demo)' }).click();
  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible();
  await expect(page.getByText('Jazda konna')).toBeVisible();
  await page.locator('.workspace-list a[href="/teams/asteria"]').click();
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
});

test('marks a ready horse timer done and clears attention', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/aalpsik');
  await page.getByRole('button', { name: 'Odwróć kartę i pokaż timery' }).click();
  await expect(page.getByText('Jazda konna')).toBeVisible();
  await page.getByRole('button', { name: 'Oznacz wykonane' }).click();
  await expect(
    page.locator('.entry-status').filter({ hasText: 'Oznaczono: Jazda konna' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Brak gotowych timerów do oddania.')).toBeVisible();
});

test('creates a character profile without inventing equipment', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria');
  await page.getByRole('link', { name: 'Dodaj postać' }).first().click();
  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/new$/);
  await page.getByLabel('Nazwa postaci').fill('NowaSura');
  await page.getByLabel('Poziom opcjonalnie').fill('42');
  await page.getByRole('button', { name: 'Utwórz postać' }).click();
  await expect(page.getByRole('heading', { name: 'NowaSura' })).toBeVisible();
  await expect(
    page.getByText('Utworzono profil oraz pusty zestaw „Główny”.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Wróć do zespołu' }).click();
  await expect(page.getByRole('heading', { name: 'Postacie i sety' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'NowaSura' })).toBeVisible();
});

test('edits an existing character through a versioned profile form', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page.getByRole('link', { name: 'Edytuj postać' }).click();
  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht\/edit$/);
  await expect(page.getByLabel('Nazwa postaci')).toHaveValue('NerwNicht');
  await page.getByLabel('Notatka zespołu opcjonalnie').fill('Główna postać na wojnę.');
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(page.getByRole('heading', { name: 'NerwNicht' })).toBeVisible();
  await expect(page.getByText('Profil zaktualizowany').first()).toBeVisible();
});
