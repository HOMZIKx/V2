import { describe, expect, it } from 'vitest';

import { PlayerTeamError } from '../../domain/errors.js';

describe('PlayerTeamStateRepository revision conflicts', () => {
  it('uses REVISION_CONFLICT with actualRevision payload', () => {
    const error = new PlayerTeamError(
      'REVISION_CONFLICT',
      'viewer snapshot revision mismatch: expected 3, actual 9',
      { actualRevision: 9 },
    );

    expect(error).toMatchObject({
      code: 'REVISION_CONFLICT',
      actualRevision: 9,
    });
  });
});
