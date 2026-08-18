import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const GUILD_A = '1534228693017432124';
const GUILD_B = '999000999000999000';

const activityA = {
  id: 'act-1',
  guildId: GUILD_A,
  name: 'Azrael',
  description: 'Klucz + 4 DPS',
  typeId: 'type-1',
  typeLabel: 'Dungeon',
  startAt: '2026-08-20T18:00:00.000Z',
  endAt: null,
  status: 'registrations_open',
  enrollmentOpen: true,
  participantLimit: 8,
  occupiedSlots: 7,
  organizerDisplay: 'KuzynPasek',
  coOrganizerDisplay: null,
  timezone: 'Europe/Warsaw',
  locationText: null,
  cancelReason: null,
  cancelledAt: null,
  myParticipationStatus: {
    statusDefId: 'status-confirmed',
    statusLabel: 'Będę',
    confirmationState: 'confirmed',
    waitlistPosition: null,
  },
};

const activityB = {
  ...activityA,
  id: 'act-2',
  guildId: GUILD_B,
  name: 'Inny serwer',
  organizerDisplay: 'Alex',
  occupiedSlots: 1,
  participantLimit: null,
  myParticipationStatus: null,
};

function reviewDir(): string {
  const cwd = process.cwd().replace(/\\/g, '/');
  const repoRoot = cwd.endsWith('/apps/web') ? path.resolve(process.cwd(), '../..') : process.cwd();
  return path.join(repoRoot, 'tmp', 'ui-review', 'web');
}

async function grantLocalSessionCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'v2.identity.session_token',
      value: 'e2e-local-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
    },
    {
      name: 'v2.identity.session_token',
      value: 'e2e-local-session',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    },
  ]);
}

test.beforeEach(async ({ page }) => {
  await grantLocalSessionCookie(page);
});

async function mockMemberApi(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (url.pathname === '/activity/v1/activities' && method === 'GET') {
      const guildId = url.searchParams.get('guildId');
      const items = guildId === GUILD_B ? [activityB] : [activityA];
      await route.fulfill({ json: items });
      return;
    }
    if (url.pathname === '/activity/v1/me/activities' && method === 'GET') {
      await route.fulfill({ json: [activityA] });
      return;
    }
    if (url.pathname === `/activity/v1/activities/${activityA.id}` && method === 'GET') {
      await route.fulfill({ json: activityA });
      return;
    }
    if (url.pathname.endsWith('/participants')) {
      await route.fulfill({
        json: [
          {
            id: 'p1',
            activityId: activityA.id,
            discordUserId: '111',
            v2UserId: 'user-1',
            statusDefId: 'status-confirmed',
            confirmationState: 'confirmed',
            reconfirmDeadline: null,
            waitlistPosition: null,
            resignedAt: null,
            removedAt: null,
            occupiesSlot: true,
            displayName: 'KuzynPasek',
          },
        ],
      });
      return;
    }
    if (url.pathname.endsWith('/config')) {
      await route.fulfill({
        json: {
          settings: {},
          statuses: [
            {
              id: 'status-confirmed',
              label: 'Będę',
              occupiesSlot: true,
              behavior: 'confirmed',
              selectableByMember: true,
              active: true,
              sortOrder: 10,
            },
            {
              id: 'status-maybe',
              label: 'Może będę',
              occupiesSlot: false,
              behavior: 'tentative',
              selectableByMember: true,
              active: true,
              sortOrder: 20,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname.endsWith('/rsvp') && method === 'POST') {
      await route.fulfill({ json: { waitlistPosition: null } });
      return;
    }
    if (url.pathname === '/activity/v1/inbox') {
      await route.fulfill({
        json: {
          items: [
            {
              id: 'in-1',
              guildId: GUILD_A,
              kind: 'activity.waitlist_promoted',
              payload: { activityId: activityA.id, activityName: 'Azrael' },
              readAt: null,
              createdAt: '2026-08-17T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'no' } } });
  });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'v2.identity.session',
      value: 'e2e-session',
      url: 'http://127.0.0.1:3000',
    },
  ]);
});

test('login → member shell → activities → detail → RSVP → my → inbox', async ({ page }) => {
  await mockMemberApi(page);
  await page.goto('/aktywnosci');
  await expect(page.getByRole('link', { name: 'Aktywności' })).toBeVisible();
  await expect(page.getByRole('article').getByText('KuzynPasek')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Azrael' })).toBeVisible();
  await expect(page.getByText('Prowadzi')).toBeVisible();
  await expect(page.getByText('Miejsca: 7/8')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('NEXT_PUBLIC_');
  await expect(page.locator('body')).not.toContainText('111111');

  const detailCta = page.getByRole('article').getByRole('link', { name: 'Szczegóły' });
  const otherNav = page.getByRole('navigation', { name: 'Główne' }).getByRole('link', {
    name: 'Moje',
  });
  const ctaRest = await detailCta.evaluate((el) => getComputedStyle(el).color);
  await detailCta.hover();
  const ctaHover = await detailCta.evaluate((el) => getComputedStyle(el).color);
  expect(ctaHover).toBe(ctaRest);
  await otherNav.hover();
  const navHover = await otherNav.evaluate((el) => getComputedStyle(el).color);
  expect(navHover).not.toBe(ctaHover);

  await detailCta.click();
  await expect(page.getByRole('heading', { name: 'Azrael' })).toBeVisible();
  await expect(page.locator('.detail-facts > dt')).toHaveCount(2);
  await expect(page.locator('.detail-facts > dd')).toHaveCount(2);
  await expect(page.locator('.detail-facts > div')).toHaveCount(0);
  await page.getByRole('button', { name: 'Może będę' }).click();
  await expect(page.getByText('Status zapisany.')).toBeVisible();

  await page.getByRole('link', { name: 'Moje' }).click();
  await expect(page.getByRole('heading', { name: 'Moje aktywności' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nadchodzące' })).toBeVisible();

  await page.getByRole('link', { name: 'Powiadomienia' }).click();
  await expect(page.getByRole('heading', { name: 'Powiadomienia' })).toBeVisible();
  await expect(page.getByText('Awans z rezerwy')).toBeVisible();
});

test('unauthorized recovery from member list', async ({ page }) => {
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
  });
  await page.goto('/aktywnosci');
  await expect(page.getByText('Sesja wygasła.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zaloguj ponownie' })).toBeVisible();
});

test('guild change uses the new guild list', async ({ page }) => {
  await mockMemberApi(page);
  await page.goto('/aktywnosci');
  await expect(page.getByRole('heading', { name: 'Azrael' })).toBeVisible();
  await page.getByLabel('Serwer').selectOption(GUILD_B);
  await expect(page.getByRole('heading', { name: 'Inny serwer' })).toBeVisible();
  await expect(page.getByText('bez limitu')).toBeVisible();
});

test('mobile smoke for list and detail', async ({ page }) => {
  await mockMemberApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/aktywnosci');
  await expect(page.getByRole('navigation', { name: 'Główne' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Azrael' })).toBeVisible();
  await page.getByRole('link', { name: 'Szczegóły' }).click();
  await expect(page.getByRole('button', { name: 'Będę', exact: true })).toBeVisible();
  await expect(page.locator('.detail-facts > dt')).toHaveCount(2);
  const columns = await page
    .locator('.detail-facts')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(columns.split(' ').length).toBe(1);
});

test('screenshot review set', async ({ page }) => {
  await mockMemberApi(page);
  const dir = reviewDir();
  await mkdir(dir, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/logowanie');
  await page.screenshot({ path: path.join(dir, 'desktop-login.png'), fullPage: true });
  await page.goto('/aktywnosci');
  await page.screenshot({ path: path.join(dir, 'desktop-activities.png'), fullPage: true });
  await page.goto(`/aktywnosci/${activityA.id}`);
  await page.screenshot({ path: path.join(dir, 'desktop-detail.png'), fullPage: true });
  await page.goto('/moje');
  await page.screenshot({ path: path.join(dir, 'desktop-my.png'), fullPage: true });
  await page.goto('/powiadomienia');
  await page.screenshot({ path: path.join(dir, 'desktop-inbox.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/aktywnosci');
  await page.screenshot({ path: path.join(dir, 'mobile-activities.png'), fullPage: true });
  await page.goto(`/aktywnosci/${activityA.id}`);
  await page.screenshot({ path: path.join(dir, 'mobile-detail.png'), fullPage: true });
  await page.goto('/moje');
  await page.screenshot({ path: path.join(dir, 'mobile-my.png'), fullPage: true });
});

test('activities list does not fan-out participants', async ({ page }) => {
  let participantCalls = 0;
  await mockMemberApi(page);
  await page.route('http://127.0.0.1:4000/**/participants', async (route) => {
    participantCalls += 1;
    await route.continue();
  });
  await page.goto('/aktywnosci');
  await expect(page.getByRole('heading', { name: 'Azrael' })).toBeVisible();
  expect(participantCalls).toBe(0);
});

test('empty activities and inbox', async ({ page }) => {
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (
      url.pathname === '/activity/v1/activities' ||
      url.pathname === '/activity/v1/me/activities'
    ) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname === '/activity/v1/inbox') {
      await route.fulfill({ json: { items: [], nextCursor: null } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/aktywnosci');
  await expect(page.getByText('Na razie nie ma nic zaplanowanego.')).toBeVisible();
  await page.goto('/moje');
  await expect(page.getByText('Na razie nie masz nic na liście')).toBeVisible();
  await page.goto('/powiadomienia');
  await expect(page.getByText('Tu pojawią się alerty o Twoich aktywnościach.')).toBeVisible();
});

test('forbidden, not found, conflict RSVP and unavailable inbox', async ({ page }) => {
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (url.pathname === '/activity/v1/activities' && method === 'GET') {
      await route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
      return;
    }
    if (url.pathname === `/activity/v1/activities/${activityA.id}` && method === 'GET') {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
      return;
    }
    if (url.pathname.endsWith('/rsvp') && method === 'POST') {
      await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } } });
      return;
    }
    if (url.pathname === '/activity/v1/inbox') {
      await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/aktywnosci');
  await expect(page.getByText('Nie masz dostępu do tego serwera.')).toBeVisible();
  await page.goto(`/aktywnosci/${activityA.id}`);
  await expect(page.getByText('Ta aktywność już nie istnieje.')).toBeVisible();
  await page.goto('/powiadomienia');
  await expect(page.getByText('Ta funkcja jest chwilowo niedostępna.')).toBeVisible();
});

test('waitlist and reconfirmation are readable', async ({ page }) => {
  const waitlisted = {
    ...activityA,
    id: 'act-wait',
    name: 'Waitlist raid',
    occupiedSlots: 8,
    myParticipationStatus: {
      statusDefId: 'status-wait',
      statusLabel: 'Lista rezerwowa',
      confirmationState: 'confirmed',
      waitlistPosition: 2,
    },
  };
  const reconfirm = {
    ...activityA,
    id: 'act-reconfirm',
    name: 'Reconfirm raid',
    myParticipationStatus: {
      statusDefId: 'status-confirmed',
      statusLabel: 'Będę',
      confirmationState: 'requires_reconfirmation',
      waitlistPosition: null,
    },
  };
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (url.pathname === '/activity/v1/me/activities') {
      await route.fulfill({ json: [waitlisted, reconfirm] });
      return;
    }
    if (url.pathname === `/activity/v1/activities/${waitlisted.id}`) {
      await route.fulfill({ json: waitlisted });
      return;
    }
    if (url.pathname === `/activity/v1/activities/${reconfirm.id}`) {
      await route.fulfill({ json: reconfirm });
      return;
    }
    if (url.pathname.endsWith('/participants')) {
      const waitlistRow = url.pathname.includes(waitlisted.id);
      await route.fulfill({
        json: [
          {
            id: waitlistRow ? 'p-wait' : 'p-reconfirm',
            activityId: waitlistRow ? waitlisted.id : reconfirm.id,
            discordUserId: '111',
            v2UserId: 'user-1',
            statusDefId: 'status-confirmed',
            confirmationState: waitlistRow ? 'confirmed' : 'requires_reconfirmation',
            reconfirmDeadline: waitlistRow ? null : '2026-08-19T18:00:00.000Z',
            waitlistPosition: waitlistRow ? 2 : null,
            resignedAt: null,
            removedAt: null,
            occupiesSlot: !waitlistRow,
            displayName: 'KuzynPasek',
          },
        ],
      });
      return;
    }
    if (url.pathname.endsWith('/config')) {
      await route.fulfill({
        json: {
          settings: {},
          statuses: [
            {
              id: 'status-confirmed',
              label: 'Będę',
              occupiesSlot: true,
              behavior: 'confirmed',
              selectableByMember: true,
              active: true,
              sortOrder: 10,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname.endsWith('/reconfirm')) {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/moje');
  await expect(page.getByRole('heading', { name: 'Wymagają uwagi' })).toBeVisible();
  await expect(page.getByText('Wymaga potwierdzenia')).toBeVisible();
  await page.goto(`/aktywnosci/${waitlisted.id}`);
  await expect(page.getByText(/Lista rezerwowa/)).toBeVisible();
  await page.goto(`/aktywnosci/${reconfirm.id}`);
  await expect(page.getByRole('button', { name: 'Potwierdź udział' })).toBeVisible();
});

test('stale guild response does not overwrite the new guild', async ({ page }) => {
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (url.pathname === '/activity/v1/activities' && method === 'GET') {
      const guildId = url.searchParams.get('guildId');
      if (guildId === GUILD_A) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1200);
        });
      }
      await route.fulfill({ json: guildId === GUILD_B ? [activityB] : [activityA] });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/aktywnosci');
  await expect(page.getByLabel('Serwer')).toBeVisible();
  await page.getByLabel('Serwer').selectOption(GUILD_B);
  await expect(page.getByRole('heading', { name: 'Inny serwer' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { name: 'Inny serwer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Azrael' })).toHaveCount(0);
});

test('logout race does not keep the previous list', async ({ page }) => {
  await page.route('http://127.0.0.1:4200/**', async (route) => {
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.route('http://127.0.0.1:4000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/session/me') {
      await route.fulfill({
        json: {
          authenticated: true,
          v2UserId: 'user-1',
          discordUserId: '111',
          displayName: 'KuzynPasek',
          avatarUrl: null,
        },
      });
      return;
    }
    if (url.pathname === '/activity/v1/activities') {
      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });
      await route.fulfill({ json: [activityA] });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/aktywnosci');
  await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible();
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/logowanie/);
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { name: 'Azrael' })).toHaveCount(0);
});
