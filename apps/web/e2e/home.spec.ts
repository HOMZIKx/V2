import { expect, test, type Page } from '@playwright/test';

async function seedAuthenticatedDemo(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('destiled:player-store:v1')) return;
    const viewer = {
      id: 'mateusz',
      displayName: 'Mateusz',
      discordDisplayName: 'Mateusz',
      initials: 'M',
    };
    const now = Date.now();
    const state = {
      authStatus: 'authenticated',
      connection: 'connected',
      viewer,
      seededDemo: true,
      lastOpenedWorkspaceId: 'asteria',
      lastOpenedCharacterId: 'nerwnicht',
      intendedDestination: null,
      pendingIncomingInvitations: [
        {
          id: 'invitation-mobbynzs',
          teamId: 'asteria',
          teamName: 'Asteria',
          inviterName: 'Mateusz',
          recipientDiscordId: '994001220033445566',
          recipientDisplayName: 'MobbynZS Oak',
          status: 'pending',
          createdLabel: 'dzisiaj',
          expiresLabel: 'za 3 dni',
          revision: 1,
        },
      ],
      workspaces: [
        {
          id: 'asteria',
          name: 'Asteria',
          description: 'Wspólna przestrzeń postaci, ekwipunku i codziennych potwierdzeń zespołu.',
          revision: 19,
          updatedLabel: 'przed chwilą',
          members: [
            { id: 'mateusz', displayName: 'Mateusz', initials: 'M', role: 'owner', state: 'unknown' },
            { id: 'xiaohu', displayName: 'XiaoHu', initials: 'X', role: 'member', state: 'unknown' },
            { id: 'wicek', displayName: 'Wicek', initials: 'W', role: 'member', state: 'unknown' },
            { id: 'aalpsik', displayName: 'Aalpsik', initials: 'A', role: 'member', state: 'unknown' },
          ],
          characters: [
            {
              id: 'nerwnicht',
              name: 'NerwNicht',
              characterClass: 'sura',
              gender: 'male',
              level: 75,
              responsibleMemberId: 'mateusz',
              note: 'Główna postać',
              imagePath: '/game/classes/sura-male.png',
              activeSetId: 'war',
              revision: 7,
              archived: false,
              sets: [
                {
                  id: 'war',
                  name: 'Wojna',
                  description: 'Układ pod walkę z graczami',
                  assignments: {
                    weapon: 'zodiac-sword',
                    armor: 'ivory-suit',
                    helmet: null,
                    shield: 'battle-shield',
                    earrings: 'ebony-earrings',
                    necklace: 'jade-necklace',
                    bracelet: 'wooden-bracelet',
                    shoes: 'leather-boots',
                  },
                },
              ],
            },
            {
              id: 'aalpsik',
              name: 'Aalpsik',
              characterClass: 'ninja',
              gender: 'female',
              level: 55,
              responsibleMemberId: 'aalpsik',
              note: '',
              imagePath: '/game/classes/ninja-female.png',
              activeSetId: 'dungeon',
              revision: 4,
              archived: false,
              sets: [
                {
                  id: 'dungeon',
                  name: 'Dungeon',
                  description: 'Układ dungeonowy',
                  assignments: {
                    weapon: 'short-knife',
                    armor: null,
                    helmet: null,
                    shield: null,
                    earrings: null,
                    necklace: null,
                    bracelet: null,
                    shoes: null,
                  },
                },
              ],
            },
          ],
          items: [
            {
              id: 'zodiac-sword',
              name: 'Zatruty Miecz +9',
              iconPath: '/game/items/zodiac-sword.svg',
              category: 'weapon',
              levelLabel: 'od poziomu 75',
              bonuses: ['Średnie obrażenia +37%'],
              catalogLayer: 'team_private',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'short-knife',
              name: 'Krótki Nóż +9',
              iconPath: '/game/items/short-knife.svg',
              category: 'weapon',
              levelLabel: 'od poziomu 1',
              bonuses: ['Szybkość ataku +15%'],
              catalogLayer: 'project_hard_source',
              lastConfirmedLocation: 'Aalpsik',
              lastConfirmedBy: 'Aalpsik',
              lastConfirmedAt: 'wczoraj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'battle-shield',
              name: 'Bojowa Tarcza +9',
              iconPath: '/game/items/wiki/wiki_a2205fd93e6b34d6.png',
              category: 'shield',
              levelLabel: 'od poziomu 21',
              bonuses: ['Szansa na blok ciosu +10%'],
              catalogLayer: 'destiled_curated',
              lastConfirmedLocation: 'Aalpsik',
              lastConfirmedBy: 'Wicek',
              lastConfirmedAt: '2 dni temu',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'ivory-suit',
              name: 'Mglista Zbroja Płyt. +1',
              iconPath: '/game/items/ivory-suit.svg',
              category: 'armor',
              levelLabel: 'od poziomu 48',
              bonuses: ['Max PŻ +800'],
              catalogLayer: 'team_private',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'ebony-earrings',
              name: 'Ebonitowe Kolczyki +9',
              iconPath: '/game/items/ebony-earrings.svg',
              category: 'earrings',
              levelLabel: 'od poziomu 33',
              bonuses: ['Siła +12'],
              catalogLayer: 'project_hard_source',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'jade-necklace',
              name: 'Jadeitowy Naszyjnik +9',
              iconPath: '/game/items/jade-necklace.svg',
              category: 'necklace',
              levelLabel: 'od poziomu 28',
              bonuses: ['Zręczność +12'],
              catalogLayer: 'project_hard_source',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'wooden-bracelet',
              name: 'Drewniana Bransoleta +9',
              iconPath: '/game/items/wooden-bracelet.svg',
              category: 'bracelet',
              levelLabel: 'od poziomu 1',
              bonuses: ['Max PŻ +500'],
              catalogLayer: 'project_hard_source',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
            {
              id: 'leather-boots',
              name: 'Skórzane Kozaki +8',
              iconPath: '/game/items/leather-boots.svg',
              category: 'shoes',
              levelLabel: 'od poziomu 29',
              bonuses: ['Szybkość ruchu +17%'],
              catalogLayer: 'team_private',
              lastConfirmedLocation: 'NerwNicht',
              lastConfirmedBy: 'Mateusz',
              lastConfirmedAt: 'dzisiaj',
              archived: false,
              planned: false,
              revision: 1,
            },
          ],
          timers: [
            {
              id: 'horse-medal-aalpsik',
              characterId: 'aalpsik',
              label: 'Jazda konna',
              detail: 'Jazda 12 → 13 · Medal Konny ×5 · cooldown 23 h',
              status: 'ready',
              readyAtIso: new Date(now).toISOString(),
              remainingLabel: 'gotowe teraz',
              progressPercent: 100,
              lastActorName: 'Aalpsik',
              lastConfirmedAt: 'dzisiaj',
              discordReminder: true,
              reminderState: 'unavailable',
              operationId: null,
            },
          ],
          tasks: [
            {
              id: 'task-shield-location',
              title: 'Potwierdź lokalizację tarczy',
              detail: 'Sprawdź w grze i potwierdź ręcznie.',
              characterId: 'nerwnicht',
              characterName: 'NerwNicht',
              assigneeName: 'Mateusz',
              dueLabel: 'teraz',
              status: 'ready',
              source: 'equipment',
            },
          ],
          notes: [],
          invitations: [],
          history: [
            {
              id: 'hist-shield',
              teamId: 'asteria',
              actorId: 'mateusz',
              actorName: 'Mateusz',
              actorInitials: 'M',
              characterId: 'nerwnicht',
              characterName: 'NerwNicht',
              resource: 'equipment',
              title: 'Potwierdzono lokalizację tarczy',
              detail: 'Bojowa Tarcza +9',
              occurredAtLabel: 'wczoraj',
              revision: 19,
            },
            {
              id: 'hist-book',
              teamId: 'asteria',
              actorId: 'mateusz',
              actorName: 'Mateusz',
              actorInitials: 'M',
              characterId: 'nerwnicht',
              characterName: 'NerwNicht',
              resource: 'timer',
              title: 'Rozpoczęto timer księgi',
              detail: 'Smoczy Wir',
              occurredAtLabel: 'wczoraj',
              revision: 18,
            },
          ],
        },
      ],
    };
    window.localStorage.setItem('destiled:player-store:v1', JSON.stringify(state));
  });
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
  await page.getByRole('navigation', { name: 'Główna nawigacja' }).getByRole('link', { name: 'Postacie' }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole('heading', { name: 'Postacie', exact: true })).toBeVisible();
  await expect(
    page.getByText('Lista postaci z Twoich przestrzeni', {
      exact: false,
    }).first(),
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
  await expect(page.getByText('Przedmioty', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Broń: Zatruty Miecz/ })).toBeVisible();
});

test('separates planned equipment, confirmed location and character timers', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/teams/asteria/characters/nerwnicht');
  await page.getByRole('button', { name: /Krótki Nóż/ }).click();
  await page.getByRole('button', { name: /Broń: Zatruty Miecz/ }).click();
  await expect(page.getByRole('button', { name: /Broń: Krótki Nóż/ })).toBeVisible();
  await page.locator('.catalog-item').filter({ hasText: 'Bojowa Tarcza +9' }).click();
  await page.getByRole('button', { name: /Potwierdź: jest na NerwNicht/ }).click();
  await expect(page.getByText(/Mateusz · teraz/)).toBeVisible();
  await page.getByRole('button', { name: 'Odwróć kartę i pokaż timery' }).click();
  await expect(page.getByText('Postęp postaci')).toBeVisible();
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

test('grants team access only after the recipient accepts', async ({ page }) => {
  await seedAuthenticatedDemo(page);
  await page.goto('/invitations/invitation-mobbynzs');
  await expect(page.getByText('Zalogowano jako')).toBeVisible();
  await page.getByRole('button', { name: 'Akceptuję i dołączam' }).click();
  await expect(page.getByRole('heading', { name: 'Zaproszenie zaakceptowane' })).toBeVisible();
  await expect(
    page.getByText('Dostęp do zespołu został przyznany po Twoim potwierdzeniu.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otwórz przestrzeń zespołu' })).toBeVisible();
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
  await expect(page.locator('.entry-status').filter({ hasText: 'Oznaczono: Jazda konna' })).toBeVisible();
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
