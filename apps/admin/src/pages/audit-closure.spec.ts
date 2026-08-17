import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(dir, name), 'utf8');
}

describe('Admin audit-closure product contracts', () => {
  it('shows Discord channel metadata failure instead of an empty picker', () => {
    const source = read('ChannelsPage.tsx');
    expect(source).toContain('Nie udało się pobrać kanałów z Discorda.');
    expect(source).toContain('Spróbuj ponownie');
    expect(source).not.toContain('.catch(() => [])');
    expect(source).toContain('Zapisz kanały publikacji');
    expect(source).toContain('MultiSelect');
  });

  it('shows Discord role metadata failure instead of an empty picker', () => {
    const source = read('PingsPage.tsx');
    expect(source).toContain('Nie udało się pobrać ról z Discorda.');
    expect(source).toContain('Spróbuj ponownie');
    expect(source).not.toContain('.catch(() => [])');
  });

  it('keeps declined independent of occupiesSlot and warns when both are set', () => {
    const source = read('StatusesPage.tsx');
    expect(source).toContain('Odrzucenie — RSVP');
    expect(source).not.toContain('Odrzucenie — nie zajmuje miejsca');
    expect(source).toContain("behavior === 'declined' && form.occupiesSlot");
    expect(source).toContain('osobnymi polami');
  });
});
