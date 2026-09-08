import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('server-side Player Team routing', () => {
  it('does not route Team DM panel auth through the public request origin', () => {
    const text = source('../../app/api/team-dm-panels/[workspaceId]/route.ts');
    expect(text).toContain('internalWebUrl(request.url');
    expect(text).not.toMatch(/new URL\(\s*[`'"]\/player-team/);
  });

  it('does not route Discord notify auth through the public request origin', () => {
    const text = source('../../app/api/discord-notify/route.ts');
    expect(text).toContain('internalWebUrl(request.url');
    expect(text).not.toMatch(/new URL\(\s*[`'"]\/player-team/);
  });

  it('does not reuse the Activity service target for Player Team', () => {
    const text = source('../../app/player-team/[...path]/route.ts');
    const playerTeamTarget = text.match(/function playerTeamTarget\(\): string \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(playerTeamTarget).toContain('PLAYER_TEAM_PROXY_TARGET');
    expect(playerTeamTarget).not.toContain('ACTIVITY_PROXY_TARGET');
  });
});
