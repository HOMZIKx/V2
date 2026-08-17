import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

describe('Admin App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the Control Center dashboard', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain('V2 Control Center');
    expect(markup).not.toContain('V2 Admin is running');
    expect(markup).toContain('Pulpit');
  });

  it('renders activity overview route with mocked fetch', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/admin/guilds') && !url.includes('/readiness') && !url.includes('/hub')) {
          return Promise.resolve(
            new Response(JSON.stringify({ guilds: [{ id: 'g1', name: 'Destiny' }] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (url.includes('/readiness')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                state: 'READY',
                issues: [],
                counts: { types: 2, statuses: 3 },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (url.includes('/hub')) {
          return Promise.resolve(
            new Response(JSON.stringify({ hubChannelId: '111', status: 'active' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }),
    );

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/activity']}>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain('Konfiguracja Centrum');
    expect(markup).toContain('Ładowanie');
  });
});
