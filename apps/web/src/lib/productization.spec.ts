import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ApiClientError } from './api';
import { formatEventCapacity, organizerDisplayName } from './capacity';
import { mapApiError } from './load-state';
import { bucketMyActivity } from './member-copy';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

describe('WWW productization contracts', () => {
  it('does not N+1 listParticipants from the activities list', () => {
    const source = read('components/ActivitiesPage.tsx');
    expect(source).not.toContain('listParticipants');
    expect(source).not.toContain('listMyActivities');
    expect(source).toContain('occupiedSlots');
    expect(source).toContain('myParticipationStatus');
  });

  it('does not N+1 listParticipants from my activities', () => {
    const source = read('components/MyActivitiesPage.tsx');
    expect(source).not.toContain('listParticipants');
  });

  it('does not render raw Discord IDs or ENV names on member surfaces', () => {
    for (const file of [
      'components/ActivitiesPage.tsx',
      'components/ActivityDetailPage.tsx',
      'components/MyActivitiesPage.tsx',
      'components/InboxPage.tsx',
      'components/AppShell.tsx',
      'components/LoginPage.tsx',
    ]) {
      const source = read(file);
      expect(source).not.toContain('NEXT_PUBLIC_');
      expect(source).not.toContain('organizerDiscordUserId');
      expect(source).not.toContain('Discord {');
      expect(source).not.toContain('ten sam backend');
    }
  });

  it('formats finite and unlimited capacity like Discord', () => {
    expect(formatEventCapacity(3, 8)).toBe('Miejsca: 3/8');
    expect(formatEventCapacity(3, null)).toContain('bez limitu');
    expect(formatEventCapacity(3, null)).toContain('zapisanych: 3');
  });

  it('hides missing organizer behind nieznany użytkownik', () => {
    expect(organizerDisplayName({})).toBe('nieznany użytkownik');
    expect(organizerDisplayName({ organizerDisplay: 'KuzynPasek' })).toBe('KuzynPasek');
  });

  it('buckets my activities into upcoming, attention and completed', () => {
    expect(
      bucketMyActivity({
        status: 'registrations_open',
        myParticipationStatus: { confirmationState: 'requires_reconfirmation' },
      } as never),
    ).toBe('needs_attention');
    expect(bucketMyActivity({ status: 'completed' } as never)).toBe('completed');
    expect(bucketMyActivity({ status: 'registrations_open' } as never)).toBe('upcoming');
  });

  it('maps member HTTP errors without backend vocabulary', () => {
    expect(mapApiError(new ApiClientError('x', { status: 401 }))).toEqual({ kind: 'unauthorized' });
    expect(mapApiError(new ApiClientError('x', { status: 403 }))).toEqual({ kind: 'forbidden' });
    expect(mapApiError(new ApiClientError('x', { status: 404 }))).toEqual({ kind: 'not_found' });
    expect(mapApiError(new ApiClientError('x', { status: 409 }))).toMatchObject({
      kind: 'conflict',
    });
    expect(mapApiError(new ApiClientError('x', { status: 503 }))).toMatchObject({
      kind: 'unavailable',
    });
  });

  it('does not use purple or LAB cyan on the member surface', () => {
    const css = readFileSync(join(srcRoot, '../app/web.css'), 'utf8');
    expect(css).not.toMatch(/#7C3AED/i);
    expect(css).not.toMatch(/#8B5CF6/i);
    expect(css).not.toMatch(/#06B6D4/i);
    expect(css).toContain('--v2-centrum');
  });

  it('login copy stays product-facing', () => {
    const source = read('components/LoginPage.tsx');
    expect(source).toContain('Zaloguj przez Discord');
    expect(source).toContain('Logowanie niedostępne');
    expect(source).not.toContain('OWNER_LOGIN');
    expect(source).not.toContain('permission.platform');
  });

  it('uses semantic dt/dd as direct children of the detail facts grid', () => {
    const source = read('components/ActivityDetailPage.tsx');
    expect(source).toContain('<dl className="detail-facts">');
    expect(source).toContain('<dt>Miejsca</dt>');
    expect(source).toContain('<dd>{formatEventCapacity(occupied, activity.participantLimit)}</dd>');
    expect(source).not.toMatch(/className="detail-facts">\s*<div>/);
    const css = readFileSync(join(srcRoot, '../app/web.css'), 'utf8');
    expect(css).toContain('.detail-facts');
    expect(css).toMatch(/\.detail-facts \{[\s\S]*display: grid;/);
  });

  it('does not let text-link hover override design-system button links', () => {
    const css = readFileSync(join(srcRoot, '../app/web.css'), 'utf8');
    expect(css).toContain('a:not(.v2-btn):hover');
    expect(css).not.toMatch(/^a:hover \{/m);
  });
});
