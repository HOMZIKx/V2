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
  await expect(page.getByRole('heading', { name: 'Utwórz swój zespół' })).toBeVisible();
});

test('creates a workspace from first-use', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kontynuuj z Discord' }).click();
  await expect(page.getByRole('heading', { name: 'Utwórz swój zespół' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByPlaceholder('np. Asteria').fill('SoloTest');
  await page.getByRole('button', { name: 'Utwórz zespół' }).click();
  await page.getByRole('link', { name: 'Otwórz Zespół' }).click();
  await expect(page.getByRole('heading', { name: 'SoloTest', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notatki zespołu' })).toBeVisible();
});

test('opens seeded team workspace from the member dashboard', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible();
  await page.getByRole('link', { name: 'Otwórz zespół' }).click();
  await expect(page).toHaveURL(/\/teams\/asteria$/);
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ostatnie zmiany' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notatki zespołu' })).toBeVisible();
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
          .getByText('Lista postaci z Twoich zespołów', {
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

test('opens the character equipment card from the character directory', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/characters');
  await page.getByRole('link', { name: /NerwNicht/ }).first().click();
  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht$/);
  await expect(page.getByRole('link', { name: /Edytuj NerwNicht/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inventory zespołu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Broń/i }).first()).toBeVisible();
});

test('separates planned equipment, confirmed location and character timers', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page.getByRole('button', { name: 'Pokaż założone' }).click();
  await page
    .getByRole('button', { name: /Bojowa Tarcza \+9/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Potwierdź: jest na NerwNicht/ }).click();
  await expect(page.getByText(/Ostatnio potwierdzona lokalizacja:/)).toBeVisible();
  await expect(page.getByText('NerwNicht').first()).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj przedmiot' }).click();
  await page.getByLabel('Nazwa przedmiotu z gry').fill('Lwi Miecz');
  await page.getByLabel('Ulepszenie').selectOption('4');
  await page.getByRole('button', { name: 'Dodaj do torby' }).click();
  await expect(page.locator('.entry-status').filter({ hasText: 'Lwi Miecz +4' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lwi Miecz \+4/ }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Timery PH' }).click();
  await expect(page.getByText('Timery PH', { exact: true }).first()).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Utwórz swój zespół' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Wczytaj przykładowe Asteria (demo)' }).click();
  await expect(page.getByRole('heading', { name: /Witaj, Mateusz/ })).toBeVisible();
  await page.getByRole('link', { name: 'Otwórz zespół' }).click();
  await expect(page.getByRole('heading', { name: 'Asteria', exact: true })).toBeVisible();
  await expect(page.getByText('Jazda konna').first()).toBeVisible();
});

test('marks a ready horse timer done and clears attention', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/aalpsik');
  await page.getByRole('tab', { name: 'Timery PH' }).click();
  await expect(page.getByText('Jazda konna').first()).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).first().click();
  await expect(page.getByRole('button', { name: 'Zablokowany' }).first()).toBeVisible();
  await expect(page.locator('.eq-char-timer.is-running').first()).toBeVisible();
});

test('creates a character profile without inventing equipment', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/characters');
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
  await expect(page.getByRole('heading', { name: 'Ostatnie zmiany' })).toBeVisible();
  await page.goto('/characters');
  await expect(page.getByRole('heading', { name: 'NowaSura' })).toBeVisible();
});

test('edits an existing character through a versioned profile form', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page
    .getByRole('link', { name: /Edytuj/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/teams\/asteria\/characters\/nerwnicht\/edit$/);
  await expect(page.getByLabel('Nazwa postaci')).toHaveValue('NerwNicht');
  await page.getByLabel('Notatka zespołu opcjonalnie').fill('Główna postać na wojnę.');
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(page.getByRole('heading', { name: 'NerwNicht' })).toBeVisible();
  await expect(page.getByText('Profil zaktualizowany').first()).toBeVisible();
});
