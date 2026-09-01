import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

const GUILD_A = 'guild-e2e-1';
const GUILD_B = 'guild-e2e-2';
const ACTOR_ID = '999888777666555444';
const CH_CENTRUM = '123456789012345678';
const CH_OGLOSZENIA = '111111111111111111';
const CH_EVENTY = '222222222222222222';
const CH_HANDEL = '333333333333333333';
const CH_OFFTOPIC = '444444444444444444';

type MockType = {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  isOther: boolean;
  sortOrder: number;
};

type MockStatus = {
  id: string;
  label: string;
  occupiesSlot: boolean;
  behavior: string;
  selectableByMember: boolean;
  active: boolean;
  sortOrder: number;
  seedKey?: string | null;
};

type MockField = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  requiredDefault: boolean;
  active: boolean;
};

type MockReason = {
  id: string;
  key: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

type GuildStore = {
  types: MockType[];
  statuses: MockStatus[];
  fields: MockField[];
  reasons: MockReason[];
  channelIds: string[];
  roleIds: string[];
  configRevision: number;
  organizerDefaultStatusId: string | null;
  waitlistPromotionStatusId: string | null;
  audit: Array<{
    id: string;
    action: string;
    actorDiscordUserId: string;
    createdAt: string;
    entityType?: string;
    entityId?: string;
  }>;
  forceChannelsConflict: boolean;
  forceForbidden: boolean;
};

function emptyStore(): GuildStore {
  return {
    types: [],
    statuses: [],
    fields: [],
    reasons: [],
    channelIds: [],
    roleIds: [],
    configRevision: 1,
    organizerDefaultStatusId: null,
    waitlistPromotionStatusId: null,
    audit: [],
    forceChannelsConflict: false,
    forceForbidden: false,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function readinessFor(store: GuildStore): {
  state: 'READY' | 'CONFIGURATION_REQUIRED';
  status: 'READY' | 'NOT_READY';
  ready: boolean;
  issues: Array<{ code: string; message: string }>;
  counts: Record<string, number>;
} {
  const issues: Array<{ code: string; message: string }> = [];
  if (store.types.filter((t) => t.enabled).length === 0) {
    issues.push({ code: 'NO_TYPES', message: 'Need at least one enabled type' });
  }
  if (store.statuses.filter((s) => s.active).length < 3) {
    issues.push({ code: 'NO_STATUSES', message: 'Need active statuses' });
  }
  if (store.organizerDefaultStatusId === null) {
    issues.push({ code: 'NO_ORGANIZER_DEFAULT', message: 'Organizer default missing' });
  }
  if (store.waitlistPromotionStatusId === null) {
    issues.push({ code: 'NO_WAITLIST_DEFAULT', message: 'Waitlist promotion missing' });
  }
  if (store.channelIds.length === 0) {
    issues.push({ code: 'NO_CHANNELS', message: 'Publish channels required' });
  }
  const ready = issues.length === 0;
  return {
    state: ready ? 'READY' : 'CONFIGURATION_REQUIRED',
    status: ready ? 'READY' : 'NOT_READY',
    ready,
    issues,
    counts: {
      types: store.types.length,
      statuses: store.statuses.length,
      fields: store.fields.length,
      channels: store.channelIds.length,
    },
  };
}

async function installActivityAdminMocks(
  page: Page,
  options: {
    failDiscordChannels?: boolean;
    failDiscordRoles?: boolean;
    failAdminGuilds?: boolean;
  } = {},
): Promise<{
  stores: Map<string, GuildStore>;
}> {
  const stores = new Map<string, GuildStore>([
    [GUILD_A, emptyStore()],
    [GUILD_B, emptyStore()],
  ]);

  await page.route('**/activity/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (pathname === '/activity/v1/admin/guilds' && method === 'GET') {
      if (options.failAdminGuilds === true) {
        await json(route, 503, {
          error: { code: 'CONFIG_INVALID', message: 'Authorization is unavailable' },
        });
        return;
      }
      await json(route, 200, {
        guilds: [{ id: GUILD_A, name: 'E2E Guild Alpha' }],
      });
      return;
    }

    const guildMatch = pathname.match(/^\/activity\/v1\/admin\/guilds\/([^/]+)(\/.*)?$/);
    if (guildMatch === null) {
      if (pathname.match(/^\/activity\/v1\/guilds\/[^/]+\/ensure-defaults$/) && method === 'POST') {
        const guildId = pathname.split('/')[4] ?? GUILD_A;
        const store = stores.get(guildId) ?? emptyStore();
        stores.set(guildId, store);
        const confirmed =
          store.statuses.find((s) => s.behavior === 'confirmed') ?? store.statuses[0] ?? null;
        if (confirmed !== null) {
          store.organizerDefaultStatusId = confirmed.id;
          store.waitlistPromotionStatusId = confirmed.id;
        }
        store.audit.unshift({
          id: `audit-${store.audit.length + 1}`,
          action: 'admin.defaults.ensure',
          actorDiscordUserId: ACTOR_ID,
          createdAt: new Date().toISOString(),
        });
        await json(route, 200, { ok: true });
        return;
      }
      await json(route, 404, { error: { code: 'NOT_FOUND', message: 'Unhandled mock path' } });
      return;
    }

    const guildId = decodeURIComponent(guildMatch[1] ?? '');
    const rest = guildMatch[2] ?? '';
    const store = stores.get(guildId) ?? emptyStore();
    stores.set(guildId, store);

    if (store.forceForbidden) {
      await json(route, 403, {
        error: { code: 'FORBIDDEN', message: 'Cross-guild forbidden' },
      });
      return;
    }

    if (rest === '/readiness' && method === 'GET') {
      await json(route, 200, readinessFor(store));
      return;
    }

    if (rest === '/types' && method === 'GET') {
      await json(route, 200, { items: store.types });
      return;
    }
    if (rest === '/types' && method === 'POST') {
      const body = request.postDataJSON() as {
        key: string;
        label: string;
        enabled?: boolean;
        isOther?: boolean;
      };
      const created: MockType = {
        id: `type-${store.types.length + 1}`,
        key: body.key ?? 'raid',
        label: body.label,
        enabled: body.enabled ?? true,
        isOther: body.isOther ?? false,
        sortOrder: store.types.length,
      };
      store.types.push(created);
      store.audit.unshift({
        id: `audit-${store.audit.length + 1}`,
        action: 'admin.type.create',
        actorDiscordUserId: ACTOR_ID,
        createdAt: new Date().toISOString(),
        entityType: 'type',
        entityId: created.id,
      });
      await json(route, 200, created);
      return;
    }

    if (rest === '/statuses' && method === 'GET') {
      await json(route, 200, { items: store.statuses });
      return;
    }
    if (rest === '/statuses' && method === 'POST') {
      const body = request.postDataJSON() as Omit<MockStatus, 'id'>;
      const created: MockStatus = {
        id: `status-${store.statuses.length + 1}`,
        ...body,
      };
      store.statuses.push(created);
      if (created.behavior === 'confirmed') {
        store.organizerDefaultStatusId = created.id;
        store.waitlistPromotionStatusId = created.id;
      }
      store.audit.unshift({
        id: `audit-${store.audit.length + 1}`,
        action: 'admin.status.create',
        actorDiscordUserId: ACTOR_ID,
        createdAt: new Date().toISOString(),
        entityType: 'status',
        entityId: created.id,
      });
      await json(route, 200, created);
      return;
    }

    if ((rest === '/fields' || rest === '/participant-fields') && method === 'GET') {
      await json(route, 200, { items: store.fields });
      return;
    }
    if ((rest === '/fields' || rest === '/participant-fields') && method === 'POST') {
      const body = request.postDataJSON() as Omit<MockField, 'id'>;
      const created: MockField = {
        id: `field-${store.fields.length + 1}`,
        ...body,
      };
      store.fields.push(created);
      store.audit.unshift({
        id: `audit-${store.audit.length + 1}`,
        action: 'admin.field.create',
        actorDiscordUserId: ACTOR_ID,
        createdAt: new Date().toISOString(),
        entityType: 'field',
        entityId: created.id,
      });
      await json(route, 200, created);
      return;
    }

    if (rest === '/channels' && method === 'GET') {
      await json(route, 200, { channelIds: store.channelIds });
      return;
    }
    if (rest === '/channels' && method === 'PUT') {
      if (store.forceChannelsConflict) {
        await json(route, 409, {
          error: {
            code: 'CONFLICT',
            message: 'Config revision mismatch: expected 1, actual 2',
          },
        });
        return;
      }
      const body = request.postDataJSON() as { channelIds: string[] };
      store.channelIds = body.channelIds;
      store.configRevision += 1;
      store.audit.unshift({
        id: `audit-${store.audit.length + 1}`,
        action: 'admin.channels.put',
        actorDiscordUserId: ACTOR_ID,
        createdAt: new Date().toISOString(),
      });
      await json(route, 200, { channelIds: store.channelIds });
      return;
    }

    if ((rest === '/pings' || rest === '/ping-roles') && method === 'GET') {
      await json(route, 200, { roleIds: store.roleIds, maxOrganizerRoles: 2 });
      return;
    }
    if ((rest === '/pings' || rest === '/ping-roles') && method === 'PUT') {
      const body = request.postDataJSON() as { roleIds: string[] };
      store.roleIds = body.roleIds;
      store.audit.unshift({
        id: `audit-${store.audit.length + 1}`,
        action: 'admin.pings.put',
        actorDiscordUserId: ACTOR_ID,
        createdAt: new Date().toISOString(),
      });
      await json(route, 200, { roleIds: store.roleIds, maxOrganizerRoles: 2 });
      return;
    }

    if (rest === '/report-reasons' && method === 'GET') {
      await json(route, 200, { items: store.reasons });
      return;
    }
    if (rest === '/report-reasons' && method === 'POST') {
      const body = request.postDataJSON() as Omit<MockReason, 'id'>;
      const created: MockReason = {
        id: `reason-${store.reasons.length + 1}`,
        ...body,
      };
      store.reasons.push(created);
      await json(route, 200, created);
      return;
    }

    if (rest === '/discord/members/resolve' && method === 'POST') {
      await json(route, 200, { members: [] });
      return;
    }

    if (rest === '/discord/channels' && method === 'GET') {
      if (options.failDiscordChannels === true) {
        await json(route, 503, {
          error: { code: 'CONFIG_INVALID', message: 'Discord channel metadata is unavailable' },
        });
        return;
      }
      await json(route, 200, {
        channels: [
          { id: CH_CENTRUM, name: 'centrum-aktywnosci', type: 0, usable: true },
          { id: CH_OGLOSZENIA, name: 'ogloszenia', type: 0, usable: true },
          { id: CH_EVENTY, name: 'eventy', type: 0, usable: true },
          { id: CH_HANDEL, name: 'handel', type: 0, usable: true },
          { id: CH_OFFTOPIC, name: 'offtopic', type: 0, usable: true },
        ],
      });
      return;
    }
    if (rest === '/discord/roles' && method === 'GET') {
      if (options.failDiscordRoles === true) {
        await json(route, 503, {
          error: { code: 'CONFIG_INVALID', message: 'Discord role metadata is unavailable' },
        });
        return;
      }
      await json(route, 200, {
        roles: [
          { id: '987654321098765432', name: 'Smok', managed: false, everyone: false },
          { id: guildId, name: '@everyone', managed: false, everyone: true },
        ],
      });
      return;
    }
    if (rest === '/hub' && method === 'GET') {
      await json(route, 200, {
        hubChannelId: store.channelIds[0] ?? null,
        status: store.channelIds.length > 0 ? 'active' : null,
        configRevision: store.configRevision,
      });
      return;
    }
    if (rest === '/hub/publish-intent' && method === 'POST') {
      const body = request.postDataJSON() as { channelId: string };
      store.channelIds = [body.channelId];
      await json(route, 200, {
        hubChannelId: body.channelId,
        configRevision: store.configRevision,
      });
      return;
    }
    if ((rest === '/hub/publish' || rest === '/hub/reconcile') && method === 'POST') {
      await json(route, 200, { mode: 'updated', messageId: 'msg-1' });
      return;
    }
    if (rest === '/config' && method === 'GET') {
      await json(route, 200, {
        configRevision: store.configRevision,
        maxActivePerCreator: 4,
        maxCreateHorizonDays: 14,
        allowOtherActivity: true,
        postRetentionHoursAfterFinish: 72,
        dmNotificationsEnabled: true,
        reminders: [{ offsetMinutes: 30 }],
        hubChannelId: store.channelIds[0] ?? null,
      });
      return;
    }
    if (rest === '/config' && method === 'PUT') {
      store.configRevision += 1;
      await json(route, 200, { configRevision: store.configRevision });
      return;
    }

    if (rest === '/audit' && method === 'GET') {
      await json(route, 200, { items: store.audit, total: store.audit.length });
      return;
    }

    if (rest === '/limits' && method === 'GET') {
      await json(route, 200, {
        maxActivePerCreator: 4,
        horizonDays: 14,
        otherActivityEnabled: true,
        retentionHours: 72,
      });
      return;
    }

    await json(route, 404, {
      error: { code: 'NOT_FOUND', message: `No mock for ${method} ${pathname}` },
    });
  });

  return { stores };
}

test.describe('Centrum admin config flow (mocked API)', () => {
  test('guild selector → configure → checklist → persist → 409/403 → mobile', async ({ page }) => {
    const { stores } = await installActivityAdminMocks(page);
    const nav = page.getByLabel('V2 Control Center');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'V2 Control Center' })).toBeVisible();
    await expect(page.locator('#guild-select')).toHaveValue(GUILD_A);
    await expect(page.locator('#guild-select')).toContainText('E2E Guild Alpha');
    await expect(page.locator('#guild-select')).not.toContainText(`Guild ${GUILD_A}`);
    await expect(page.locator('#guild-select')).not.toContainText('E2E Guild Beta');

    await nav.getByRole('link', { name: 'Przegląd' }).click();
    await expect(page.getByRole('heading', { name: 'Konfiguracja Centrum' })).toBeVisible();

    await nav.getByRole('link', { name: 'Statusy zapisów' }).click();
    await expect(page.getByRole('heading', { name: 'Statusy zapisów' })).toBeVisible();

    async function createStatus(label: string, behavior: string) {
      await page.getByRole('button', { name: 'Dodaj status' }).click();
      await page.getByLabel('Nazwa', { exact: true }).fill(label);
      await page.getByLabel('Znaczenie').selectOption(behavior);
      await page.getByRole('button', { name: 'Zapisz' }).click();
      await expect(page.getByText('Status dodany.')).toBeVisible();
    }

    await createStatus('Potwierdzony', 'confirmed');
    await createStatus('Niepewny', 'tentative');
    await createStatus('Odrzucony', 'declined');
    await expect(page.getByText('Potwierdzony').first()).toBeVisible();
    await page.getByRole('button', { name: 'Dodaj status' }).click();
    await page.getByLabel('Znaczenie').selectOption('declined');
    await expect(page.getByText(/osobnymi polami/)).toBeVisible();
    await expect(page.getByLabel('Znaczenie')).not.toContainText('nie zajmuje miejsca');
    await page.getByRole('button', { name: 'Anuluj' }).click();

    await nav.getByRole('link', { name: 'Typy aktywności' }).click();
    await page.getByRole('button', { name: 'Dodaj typ' }).click();
    await page.getByLabel('Nazwa', { exact: true }).fill('Raid night');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Typ dodany.')).toBeVisible();
    await expect(page.getByText('Raid night')).toBeVisible();
    await expect(page.getByText('Aktywny').first()).toBeVisible();

    await nav.getByRole('link', { name: 'Formularz uczestnika' }).click();
    await page.getByRole('button', { name: 'Dodaj pole' }).click();
    await page.getByLabel('Nazwa', { exact: true }).fill('Klasa');
    await page.getByLabel('Klucz techniczny').fill('player_class');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Pole dodane.')).toBeVisible();

    await nav.getByRole('link', { name: 'Centrum V2' }).click();
    await expect(page.getByRole('heading', { name: 'Centrum V2' })).toBeVisible();
    await page.getByRole('checkbox', { name: '#centrum-aktywnosci' }).check();
    await page.getByRole('checkbox', { name: '#ogloszenia' }).check();
    await page.getByRole('checkbox', { name: '#eventy' }).check();
    await page.getByRole('checkbox', { name: '#handel' }).check();
    await page.getByRole('button', { name: 'Zapisz kanały publikacji' }).click();
    await expect(page.getByText('Kanały publikacji zapisane.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '#centrum-aktywnosci' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#ogloszenia' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#eventy' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#handel' })).toBeChecked();
    await page.getByRole('checkbox', { name: '#eventy' }).uncheck();
    await page.getByRole('button', { name: 'Zapisz kanały publikacji' }).click();
    await expect(page.getByText('Kanały publikacji zapisane.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '#eventy' })).not.toBeChecked();
    await page.getByRole('checkbox', { name: '#offtopic' }).check();
    await page.getByRole('button', { name: 'Zapisz kanały publikacji' }).click();
    await expect(page.getByText('Kanały publikacji zapisane.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '#centrum-aktywnosci' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#ogloszenia' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#handel' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#offtopic' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '#eventy' })).not.toBeChecked();
    await page.locator('#hub-channel').selectOption(CH_CENTRUM);
    await page.getByRole('button', { name: 'Opublikuj / odśwież' }).click();
    await expect(page.getByText(/Panel opublikowany/)).toBeVisible();

    await nav.getByRole('link', { name: 'Role i pingi' }).click();
    await expect(page.getByText('Smok')).toBeVisible();
    await page.getByRole('checkbox', { name: /Smok/ }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Role do pingowania zapisane.')).toBeVisible();

    await nav.getByRole('link', { name: 'Powiadomienia' }).click();
    await expect(page.getByRole('heading', { name: 'Powiadomienia' })).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(0);
    await expect(page.getByText('Reminders JSON')).toHaveCount(0);
    await page.getByRole('button', { name: 'Dodaj przypomnienie' }).click();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Powiadomienia zapisane.')).toBeVisible();

    await nav.getByRole('link', { name: 'Limity' }).click();
    await page.getByLabel('Maksymalna liczba aktywności użytkownika').fill('3');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Limity zapisane.')).toBeVisible();

    await nav.getByRole('link', { name: 'Powody zgłoszeń' }).click();
    await page.getByRole('button', { name: 'Dodaj' }).click();
    await page.getByLabel('Nazwa', { exact: true }).fill('Spam');
    await page.getByLabel('Klucz techniczny').fill('spam');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Powód dodany.')).toBeVisible();

    await nav.getByRole('link', { name: 'Przegląd' }).click();
    await expect(page.getByText('Konfiguracja Centrum jest kompletna.')).toBeVisible();

    const cwd = process.cwd().replace(/\\/g, '/');
    const repoRoot = cwd.endsWith('/apps/admin')
      ? path.resolve(process.cwd(), '../..')
      : process.cwd();
    const reviewDir = path.join(repoRoot, 'tmp', 'ui-review', 'admin');
    await mkdir(reviewDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.screenshot({ path: path.join(reviewDir, 'desktop-dashboard.png'), fullPage: true });
    await page.goto('/activity');
    await page.screenshot({ path: path.join(reviewDir, 'desktop-przeglad.png'), fullPage: true });
    await page.goto('/activity/channels');
    await page.screenshot({ path: path.join(reviewDir, 'desktop-kanaly.png'), fullPage: true });
    await page.goto('/activity/pings');
    await page.screenshot({ path: path.join(reviewDir, 'desktop-role.png'), fullPage: true });
    await page.goto('/activity/notifications');
    await page.screenshot({
      path: path.join(reviewDir, 'desktop-powiadomienia.png'),
      fullPage: true,
    });
    await page.goto('/activity/types');
    await page.screenshot({ path: path.join(reviewDir, 'desktop-typy.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.screenshot({ path: path.join(reviewDir, 'mobile-dashboard.png'), fullPage: true });
    await page.goto('/activity/channels');
    await page.screenshot({ path: path.join(reviewDir, 'mobile-kanaly.png'), fullPage: true });
    await page.goto('/activity/types');
    await page.screenshot({ path: path.join(reviewDir, 'mobile-typy.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/activity');

    await page.reload();
    await expect(page.getByText('Konfiguracja Centrum jest kompletna.')).toBeVisible();
    await nav.getByRole('link', { name: 'Typy aktywności' }).click();
    await expect(page.getByText('Raid night')).toBeVisible();

    await nav.getByRole('link', { name: 'Centrum V2' }).click();
    const storeA = stores.get(GUILD_A)!;
    storeA.forceChannelsConflict = true;
    await page.getByRole('checkbox', { name: '#handel' }).uncheck();
    await page.getByRole('button', { name: 'Zapisz kanały publikacji' }).click();
    await expect(page.getByText('Konfiguracja zmieniła się w międzyczasie.')).toBeVisible();
    storeA.forceChannelsConflict = false;

    storeA.forceForbidden = true;
    await nav.getByRole('link', { name: 'Przegląd' }).click();
    await expect(page.getByText('Nie masz uprawnień do tej operacji.')).toBeVisible();
    storeA.forceForbidden = false;

    await nav.getByRole('link', { name: 'Audyt' }).click();
    await expect(page.getByRole('heading', { name: 'Audyt' })).toBeVisible();
    await expect(page.getByText('admin · type · create')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'V2 Control Center' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: 'Menu' }).click();
    await nav.getByRole('link', { name: 'Centrum V2' }).click();
    await expect(page.getByRole('heading', { name: 'Centrum V2' })).toBeVisible();
  });

  test('Discord channel metadata failure is visible', async ({ page }) => {
    await installActivityAdminMocks(page, { failDiscordChannels: true });
    await page.goto('/activity/channels');
    await expect(page.getByText('Nie udało się pobrać kanałów z Discorda.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zapisz kanały publikacji' })).toBeDisabled();
  });

  test('Discord role metadata failure is visible', async ({ page }) => {
    await installActivityAdminMocks(page, { failDiscordRoles: true });
    await page.goto('/activity/pings');
    await expect(page.getByText('Nie udało się pobrać ról z Discorda.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  });

  test('DEV actor keeps local guilds when the guild list API fails', async ({ page }) => {
    await installActivityAdminMocks(page, { failAdminGuilds: true });
    await page.goto('/');
    await expect(page.locator('#guild-select')).toHaveValue(GUILD_A);
    await expect(page.locator('#guild-select')).toContainText('E2E Guild Alpha');
    await expect(page.getByText(/lokalną listę deweloperską/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  });
});
