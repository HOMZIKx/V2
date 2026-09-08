type LooseRecord = Record<string, unknown>;

export type CharacterTimerPanelCharacter = {
  readonly id: string;
  readonly name: string;
  readonly characterClass: string | null;
  readonly skillPath: string | null;
  readonly imagePath: string | null;
};

export type CharacterTimerPanelTimer = {
  readonly id: string;
  readonly characterId: string;
  readonly label: string;
  readonly status: string;
  readonly remainingLabel: string | null;
  readonly detail: string | null;
  readonly readyAtIso: string | null;
  readonly iconPath: string | null;
  readonly lastConfirmedAt: string | null;
};

export type CharacterTimerPanelSnapshot = {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly memberId: string;
  readonly characters: readonly CharacterTimerPanelCharacter[];
  readonly selectedCharacterId: string | null;
  readonly selectedCharacter: CharacterTimerPanelCharacter | null;
  readonly timers: readonly CharacterTimerPanelTimer[];
};

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function readCharacterTimerPanelFromBot(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly selectedCharacterId?: string | null;
}): Promise<CharacterTimerPanelSnapshot | null> {
  let response: Response;
  try {
    response = await fetch(
      `${input.baseUrl.replace(/\/$/, '')}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      {
        method: 'GET',
        headers: { [input.demoViewerHeader]: input.viewerId },
        cache: 'no-store',
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  const workspace = asRecord(body?.state);
  if (!workspace) return null;

  const members = Array.isArray(workspace.members)
    ? workspace.members.map(asRecord).filter((row): row is LooseRecord => row !== null)
    : [];
  const member = members.find((row) => {
    const discordId = asString(row.discordAccountId);
    const id = asString(row.id);
    return discordId === input.viewerId || id === input.viewerId;
  });
  if (!member) return null;
  const memberId = asString(member.id);
  if (!memberId) return null;

  const characters = (Array.isArray(workspace.characters) ? workspace.characters : [])
    .map(asRecord)
    .filter((row): row is LooseRecord => row !== null)
    .filter((row) => row.archived !== true && asString(row.responsibleMemberId) === memberId)
    .flatMap((row): CharacterTimerPanelCharacter[] => {
      const id = asString(row.id);
      const name = asString(row.name);
      if (!id || !name) return [];
      return [
        {
          id,
          name,
          characterClass: asString(row.characterClass),
          skillPath: asString(row.skillPath),
          imagePath: asString(row.imagePath),
        },
      ];
    });

  const selectedCharacterId =
    characters.find((row) => row.id === input.selectedCharacterId)?.id ?? characters[0]?.id ?? null;
  const selectedCharacter =
    characters.find((row) => row.id === selectedCharacterId) ?? null;

  const timers = (Array.isArray(workspace.timers) ? workspace.timers : [])
    .map(asRecord)
    .filter((row): row is LooseRecord => row !== null)
    .filter((row) => selectedCharacterId !== null && asString(row.characterId) === selectedCharacterId)
    .flatMap((row): CharacterTimerPanelTimer[] => {
      const id = asString(row.id);
      const characterId = asString(row.characterId);
      if (!id || !characterId) return [];
      return [
        {
          id,
          characterId,
          label: asString(row.label) ?? id,
          status: asString(row.status) ?? 'unknown',
          remainingLabel: asString(row.remainingLabel),
          detail: asString(row.detail),
          readyAtIso: asString(row.readyAtIso),
          iconPath: asString(row.iconPath),
          lastConfirmedAt: asString(row.lastConfirmedAt),
        },
      ];
    })
    .slice(0, 12);

  return {
    workspaceId: asString(workspace.id) ?? input.workspaceId,
    workspaceName: asString(workspace.name) ?? 'Zespół',
    memberId,
    characters,
    selectedCharacterId,
    selectedCharacter,
    timers,
  };
}
