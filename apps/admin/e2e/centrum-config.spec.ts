import { expect, test, type Page, type Route } from '@playwright/test';

const GUILD_A = 'guild-e2e-1';
const GUILD_B = 'guild-e2e-2';
const ACTOR_ID = '999888777666555444';

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

type GuildStore = {
  types: MockType[];
  statuses: MockStatus[];
  fields: MockField[];
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

async function installActivityAdminMocks(page: Page): Promise<{
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
      await json(route, 200, {
        guilds: [
          { id: GUILD_A, name: 'E2E Guild Alpha' },
          { id: GUILD_B, name: 'E2E Guild Beta' },
        ],
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
        key: body.key,
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

    if (rest === '/fields' && method === 'GET') {
      await json(route, 200, { items: store.fields });
      return;
    }
    if (rest === '/fields' && method === 'POST') {
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

    if (rest === '/pings' && method === 'GET') {
      await json(route, 200, { roleIds: store.roleIds, maxOrganizerRoles: 2 });
      return;
    }
    if (rest === '/pings' && method === 'PUT') {
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

    if (rest === '/audit' && method === 'GET') {
      await json(route, 200, { items: store.audit, nextCursor: null });
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
  test('guild selector → configure → READY → persist → 409/403 → audit', async ({ page }) => {
    const { stores } = await installActivityAdminMocks(page);

    await page.goto('/activity');
    await expect(
      page.getByRole('heading', { name: 'Centrum Aktywności — Overview' }),
    ).toBeVisible();
    await expect(page.locator('#guild-select')).toBeVisible();
    await expect(page.locator('#guild-select')).toHaveValue(GUILD_A);
    await expect(page.getByText(ACTOR_ID)).toBeVisible();

    // Statuses (confirmed / tentative / declined)
    await page.getByRole('link', { name: 'Statuses' }).click();
    await expect(page.getByRole('heading', { name: 'Participation statuses' })).toBeVisible();

    async function createStatus(label: string, behavior: string, occupiesSlot: boolean) {
      const form = page.locator('.panel.form-grid').filter({
        has: page.getByRole('heading', { name: /Create status|Edit status/ }),
      });
      await form.getByRole('textbox').first().fill(label);
      await form.getByRole('combobox').selectOption(behavior);
      const occupies = form.getByRole('checkbox').first();
      if ((await occupies.isChecked()) !== occupiesSlot) {
        await occupies.click();
      }
      await form.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Status created.')).toBeVisible();
    }

    await createStatus('Confirmed', 'confirmed', true);
    await createStatus('Tentative', 'tentative', true);
    await createStatus('Declined', 'declined', false);
    await expect(page.getByRole('cell', { name: 'Confirmed', exact: true })).toBeVisible();

    // Types
    await page.getByRole('link', { name: 'Types' }).click();
    await expect(page.getByRole('heading', { name: 'Activity types' })).toBeVisible();
    {
      const form = page.locator('.panel.form-grid').filter({
        has: page.getByRole('heading', { name: /Create type|Edit type/ }),
      });
      await form.getByRole('textbox').nth(0).fill('raid');
      await form.getByRole('textbox').nth(1).fill('Raid night');
      await form.getByRole('button', { name: 'Save' }).click();
    }
    await expect(page.getByText('Type created.')).toBeVisible();
    await expect(page.getByText('Raid night')).toBeVisible();

    // Fields
    await page.getByRole('link', { name: 'Fields' }).click();
    await expect(page.getByRole('heading', { name: 'Participant fields' })).toBeVisible();
    {
      const form = page.locator('.panel.form-grid').filter({
        has: page.getByRole('heading', { name: /Create field|Edit field/ }),
      });
      await form.getByRole('textbox').nth(0).fill('player_class');
      await form.getByRole('textbox').nth(1).fill('Class');
      await form.getByRole('button', { name: 'Save' }).click();
    }
    await expect(page.getByText('Field created.')).toBeVisible();

    // Channels
    await page.getByRole('link', { name: 'Channels' }).click();
    await page.getByLabel(/Channel IDs/).fill('123456789012345678');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Channels saved.')).toBeVisible();

    // Pings
    await page.getByRole('link', { name: 'Pings' }).click();
    await page.getByLabel(/Role IDs/).fill('987654321098765432');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Ping roles saved.')).toBeVisible();

    // Ensure defaults (organizer + waitlist) then readiness READY
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await page.getByLabel('Organization ID').fill('org-e2e');
    await page.getByRole('button', { name: 'Ensure defaults' }).click();
    await expect(page.getByText('Defaults ensured.')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('READY', { exact: true })).toBeVisible();

    // Reload persistence
    await page.reload();
    await expect(page.getByText('READY', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Types' }).click();
    await expect(page.getByText('Raid night')).toBeVisible();
    await page.getByRole('link', { name: 'Channels' }).click();
    await expect(page.getByLabel(/Channel IDs/)).toHaveValue('123456789012345678');

    // Conflict 409 on stale revision
    const storeA = stores.get(GUILD_A)!;
    storeA.forceChannelsConflict = true;
    await page.getByLabel(/Channel IDs/).fill('111111111111111111');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Config revision mismatch|revision/i)).toBeVisible();
    storeA.forceChannelsConflict = false;

    // Forbidden cross-guild 403
    storeA.forceForbidden = true;
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByText(/Forbidden/i)).toBeVisible();
    storeA.forceForbidden = false;

    // Audit list has entry
    await page.getByRole('link', { name: 'Audit' }).click();
    await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
    await expect(page.getByText('admin.type.create')).toBeVisible();
    await expect(page.getByText(ACTOR_ID).first()).toBeVisible();
  });
});
