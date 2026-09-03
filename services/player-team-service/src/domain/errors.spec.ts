import { describe, expect, it } from 'vitest';

import { PlayerTeamError, isPlayerTeamError } from './errors.js';

describe('PlayerTeamError', () => {
  it('carries stable error code and optional actualRevision', () => {
    const error = new PlayerTeamError('REVISION_CONFLICT', 'conflict', {
      actualRevision: 4,
    });

    expect(error.code).toBe('REVISION_CONFLICT');
    expect(error.actualRevision).toBe(4);
    expect(isPlayerTeamError(error)).toBe(true);
  });
});
