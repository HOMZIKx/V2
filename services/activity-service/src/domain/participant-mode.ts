export type ParticipantMode = 'shared' | 'separate';

export function normalizeParticipantMode(raw: string | null | undefined): ParticipantMode {
  return raw === 'separate' ? 'separate' : 'shared';
}

export function resolveParticipationScopeGuildId(input: {
  readonly mode: ParticipantMode;
  readonly requestGuildId: string;
}): string | null {
  return input.mode === 'separate' ? input.requestGuildId : null;
}

export function assertGuildIsPublicationTarget(
  requestGuildId: string,
  targetGuildIds: readonly string[],
): void {
  if (!targetGuildIds.includes(requestGuildId)) {
    throw Object.assign(new Error('Guild is not a publication target for this activity'), {
      code: 'FORBIDDEN_GUILD',
    });
  }
}
