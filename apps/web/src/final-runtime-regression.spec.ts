import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('final runtime regressions', () => {
  it('handles Team DM Player Team reads in-process instead of self-fetching over HTTP', () => {
    const text = source('../app/api/team-dm-panels/[workspaceId]/route.ts');
    expect(text).toContain('GET as playerTeamGet');
    expect(text).toContain('callPlayerTeamGet(request');
    expect(text).not.toContain('internalWebUrl(request.url');
  });

  it('accepts pasted screenshots in the economy drop form', () => {
    const text = source('../app/teams/[teamId]/economy/team-economy.tsx');
    expect(text).toContain("window.addEventListener('paste'");
    expect(text).toContain('getAsFile()');
    expect(text).toContain('Ctrl+V');
  });
});
