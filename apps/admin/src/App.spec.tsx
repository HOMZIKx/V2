import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok' }),
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
  it('renders Status route with Technician shell nav', () => {
    const markup = renderAt('/');
    expect(markup).toContain('V2 Admin is running');
    expect(markup).toContain('Status');
    expect(markup).toContain('Konfiguracja bota');
    expect(markup).toContain('Diagnostyka');
    expect(markup).toContain('/health/live');
    expect(markup).toContain('/health/ready');
    expect(markup).toContain('/health/discord');
  });

  it('renders Konfiguracja bota placeholders without inventing live controls', () => {
    const markup = renderAt('/bot');
    expect(markup).toContain('Konfiguracja bota');
    expect(markup).toContain('szkielet — API od gateway w drodze');
    expect(markup).toContain('Rodzaje aktywności');
    expect(markup).toContain('Kanały publikacji');
    expect(markup).toContain('Cykl D-060');
    expect(markup).not.toContain('type="submit"');
  });

  it('renders Diagnostyka with raw JSON panels and refresh', () => {
    const markup = renderAt('/diagnostics');
    expect(markup).toContain('Diagnostyka');
    expect(markup).toContain('/health/live');
    expect(markup).toContain('/health/ready');
    expect(markup).toContain('/health/discord');
    expect(markup).toContain('Odśwież');
  });
});
