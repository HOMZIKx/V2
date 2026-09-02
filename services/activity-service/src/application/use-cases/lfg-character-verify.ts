import { isPartyRoleKey } from '@v2/hub-core';

import { ActivityError } from '../../domain/errors.js';
import type { LfgCharacterVerifyPort, VerifiedLfgCharacter } from '../ports/activity.ports.js';

export type { LfgCharacterVerifyPort, VerifiedLfgCharacter };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertValidCharacterId(characterId: string): void {
  if (!UUID_RE.test(characterId)) {
    throw new ActivityError('VALIDATION_FAILED', 'Invalid character id');
  }
}

/** Server-side character ownership + role validation via Identity S2S. */
export async function verifyLfgCharacter(
  port: LfgCharacterVerifyPort,
  input: {
    readonly discordUserId: string;
    readonly characterId: string;
    readonly sessionRoles: readonly string[];
  },
): Promise<VerifiedLfgCharacter> {
  assertValidCharacterId(input.characterId);
  const session = input.sessionRoles.filter(isPartyRoleKey);
  if (session.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'At least one valid party role is required');
  }
  const verified = await port.resolveCharacter({
    discordUserId: input.discordUserId,
    characterId: input.characterId,
    sessionRoles: session,
  });
  if (verified.characterId !== input.characterId) {
    throw new ActivityError('VALIDATION_FAILED', 'Character id mismatch');
  }
  for (const role of verified.sessionRoles) {
    if (!verified.supportedPartyRoles.includes(role)) {
      throw new ActivityError(
        'VALIDATION_FAILED',
        `Session role ${role} is not supported by character`,
      );
    }
  }
  return verified;
}
