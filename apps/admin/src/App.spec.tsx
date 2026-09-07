import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: 'ok' }),
  }),
);

function renderAt(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Admin App', () => {
  it('renders Status route with Technician shell nav and live health cards', () => {
    const markup = renderAt('/');
    expect(markup).toContain('V2 Admin is running');
    expect(markup).toContain('Status');
    expect(markup).toContain('Konfiguracja bota');
    expect(markup).toContain('Diagnostyka');
    expect(markup).toContain('/health/live');
    expect(markup).toContain('/health/ready');
    expect(markup).toContain('/health/discord');
    expect(markup).toContain('Auto-odświeżanie');
    expect(markup).toContain('Odśwież');
  });

  it('renders D-060 Konfiguracja with Timers + PW live-config and disabled apply', () => {
    const markup = renderAt('/bot');
    expect(markup).toContain('Konfiguracja bota');
    expect(markup).toContain('Cykl D-060');
    expect(markup).toContain('Powiadomienia Discord z Timerów');
    expect(markup).toContain('Wojna królestw (PW)');
    expect(markup).toContain('reminderMinutesBefore');
    expect(markup).toContain('notifyMinutesBefore');
    expect(markup).toContain('17:30');
    expect(markup).toContain('Rodzaje aktywności');
    expect(markup).toContain('Kanały publikacji');
    expect(markup).toContain('Panele Discord');
    expect(markup).toContain('Apply (niedostępne)');
    expect(markup).toContain('Rollback (niedostępne)');
    expect(markup).toContain('/discord/v1/capabilities');
    expect(markup).toContain('activity/v1/admin/guilds');
    expect(markup).not.toContain('type="submit"');
  });

  it('renders Diagnostyka with raw JSON panels, copy and refresh', () => {
    const markup = renderAt('/diagnostics');
    expect(markup).toContain('Diagnostyka');
    expect(markup).toContain('/health/live');
    expect(markup).toContain('/health/ready');
    expect(markup).toContain('/health/discord');
    expect(markup).toContain('Odśwież');
    expect(markup).toContain('Kopiuj');
  });
});
