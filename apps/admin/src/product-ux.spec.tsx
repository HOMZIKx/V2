import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

function json(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('Admin product UX', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a human-readable guild name, not the snowflake as the label', () => {
    vi.stubEnv('VITE_ADMIN_DEV_ACTOR_DISCORD_ID', '999888777666555444');
    vi.stubEnv(
      'VITE_ADMIN_DEV_GUILDS',
      JSON.stringify([{ id: '1534228693017432124', name: 'Destiny' }]),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/activity/v1/admin/guilds')) {
          return json({ guilds: [{ id: '1534228693017432124', name: 'Destiny' }] });
        }
        return json({});
      }),
    );

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Destiny');
    expect(markup).not.toContain('Guild 1534228693017432124');
  });

  it('renders channel picker names instead of a raw ID textarea', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/discord/channels')) {
          return json({
            channels: [{ id: '1', name: 'centrum-aktywnosci', type: 0, usable: true }],
          });
        }
        if (url.includes('/channels')) {
          return json({ allowedPublishChannelIds: ['1'], configRevision: 1 });
        }
        if (url.includes('/hub')) {
          return json({ hubChannelId: '1', status: 'active' });
        }
        if (url.includes('/admin/guilds') && !url.includes('/activity/')) {
          return json({ guilds: [] });
        }
        return json({});
      }),
    );

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/discord/centrum']}>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Centrum V2');
    expect(markup).not.toContain('Channel IDs (one per line');
  });

  it('does not render raw reminders JSON on the notifications page', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/config')) {
          return json({
            configRevision: 3,
            dmNotificationsEnabled: true,
            reminders: [{ offsetMinutes: 30 }],
            maxActivePerCreator: 4,
            maxCreateHorizonDays: 14,
            allowOtherActivity: true,
            postRetentionHoursAfterFinish: 24,
          });
        }
        return json({});
      }),
    );

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/activities/settings/notifications']}>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Powiadomienia');
    expect(markup).not.toContain('Reminders (JSON)');
    expect(markup).not.toContain('"offsetMinutes"');
  });

  it('renders types as a product list, not a developer CRUD form parked above the table', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/types')) {
          return json({
            items: [
              {
                id: 't1',
                key: 'azrael',
                label: 'Azrael',
                enabled: true,
                isOther: false,
                sortOrder: 0,
              },
            ],
          });
        }
        return json({});
      }),
    );
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/activities/types']}>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Typy aktywności');
    expect(markup).toContain('Dodaj typ');
    expect(markup).not.toContain('Create type');
  });

  it('renders role picker names instead of a Role IDs textarea', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/discord/roles')) {
          return json({ roles: [{ id: 'r1', name: 'Smok', managed: false, everyone: false }] });
        }
        if (url.includes('/ping-roles') || url.includes('/pings')) {
          return json({ roleIds: [], maxOrganizerRoles: 2 });
        }
        return json({});
      }),
    );
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/activities/settings/pings']}>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Role i pingi');
    expect(markup).not.toContain('Role IDs');
  });

  it('renders product-first navigation sections', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({})),
    );
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(markup).toContain('Discord Bot');
    expect(markup).toContain('Centrum V2');
    expect(markup).toContain('Aktywności');
    expect(markup).toContain('System');
    expect(markup).not.toContain('Centrum Aktywności');
  });
});
