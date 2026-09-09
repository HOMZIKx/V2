import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('equipment feedback regressions', () => {
  it('uses the user-facing name przetopy for the separated socket block', () => {
    const text = source('../app/teams/[teamId]/characters/[characterId]/character-equipment-v2.tsx');
    expect(text).toContain('Kamienie / przetopy');
    expect(text).not.toContain('Kamienie / wtopy');
  });
});
