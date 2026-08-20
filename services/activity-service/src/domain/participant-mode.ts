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

export function isGuildPublicationTarget(
  requestGuildId: string,
  targetGuildIds: readonly string[],
): boolean {
  return targetGuildIds.includes(requestGuildId);
}

export function filterParticipationsForMode<T extends { readonly scopeGuildId: string | null }>(
  participants: readonly T[],
  mode: ParticipantMode,
  requestGuildId: string,
): T[] {
  if (mode === 'separate') {
    return participants.filter((p) => p.scopeGuildId === requestGuildId);
  }
  return participants.filter((p) => p.scopeGuildId === null);
}
