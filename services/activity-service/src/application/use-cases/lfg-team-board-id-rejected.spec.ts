import { describe, expect, it, vi } from 'vitest';

import { ActivityError } from '../../domain/errors.js';
import { verifyLfgCharacter } from './lfg-character-verify.js';

describe('LFG character verify vs Team Character Board IDs', () => {
  it('rejects a Team Board UUID that Identity does not own as canonical character', async () => {
    const teamBoardId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const port = {
      resolveCharacter: vi.fn(() => {
        return Promise.reject(new ActivityError('NOT_FOUND', 'Character not found for user'));
      }),
    };

    await expect(
      verifyLfgCharacter(port, {
        discordUserId: '123456789012345678',
        characterId: teamBoardId,
        sessionRoles: ['DPS'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(port.resolveCharacter).toHaveBeenCalledWith({
      discordUserId: '123456789012345678',
      characterId: teamBoardId,
      sessionRoles: ['DPS'],
    });
  });

  it('rejects non-UUID board slugs before Identity call', async () => {
    const port = { resolveCharacter: vi.fn() };
    await expect(
      verifyLfgCharacter(port, {
        discordUserId: '123456789012345678',
        characterId: 'nerwnicht',
        sessionRoles: ['DPS'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(port.resolveCharacter).not.toHaveBeenCalled();
  });
});
