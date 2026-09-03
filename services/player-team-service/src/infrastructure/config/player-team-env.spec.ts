import { describe, expect, it } from 'vitest';

import { parsePlayerTeamEnv } from './player-team-env.js';

describe('parsePlayerTeamEnv', () => {
  it('parses demo defaults for local development', () => {
    const config = parsePlayerTeamEnv({
      PLAYER_TEAM_DATABASE_URL: 'postgresql://player_team:player_team_dev_password@127.0.0.1:5432/player_team',
    });

    expect(config.PLAYER_TEAM_SERVICE_PORT).toBe(4400);
    expect(config.PLAYER_TEAM_ALLOW_DEMO_WRITE).toBe(true);
    expect(config.PLAYER_TEAM_DEMO_VIEWER_HEADER).toBe('x-demo-viewer-id');
    expect(config.PLAYER_TEAM_CORS_ORIGINS).toEqual([]);
  });

  it('rejects missing database url', () => {
    expect(() => parsePlayerTeamEnv({})).toThrow(/PLAYER_TEAM_DATABASE_URL/);
  });

  it('rejects invalid boolean spellings', () => {
    expect(() =>
      parsePlayerTeamEnv({
        PLAYER_TEAM_DATABASE_URL: 'postgresql://player_team:pw@127.0.0.1:5432/player_team',
        PLAYER_TEAM_ALLOW_DEMO_WRITE: 'maybe',
      }),
    ).toThrow(/PLAYER_TEAM_ALLOW_DEMO_WRITE/);
  });
});
