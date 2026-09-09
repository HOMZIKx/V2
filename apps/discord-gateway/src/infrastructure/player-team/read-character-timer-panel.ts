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

async function fetchState(
  url: string,
  demoViewerHeader: string,
  viewerId: string,
): Promise<LooseRecord | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { [demoViewerHeader]: viewerId },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { readonly state?: unknown } | null;
  return asRecord(body?.state);
}

async function fetchGatewayWorkspaceState(input: {
  readonly url: string;
  readonly serviceSecret: string;
  readonly viewerId: string;
}): Promise<{ readonly state: LooseRecord; readonly viewerAppId: string | null } | null> {
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: 'GET',
      headers: {
        'x-discord-gateway-secret': input.serviceSecret,
        'x-discord-user-id': input.viewerId,
      },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    readonly state?: unknown;
    readonly viewerAppId?: unknown;
  } | null;
  const state = asRecord(body?.state);
  if (!state) return null;
  return { state, viewerAppId: asString(body?.viewerAppId) };
}

export async function readCharacterTimerPanelFromBot(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly selectedCharacterId?: string | null;
  readonly serviceSecret?: string | null;
}): Promise<CharacterTimerPanelSnapshot | null> {
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const serviceSecret = input.serviceSecret?.trim() ?? '';

  let workspace: LooseRecord | null = null;
  let viewerAppId: string | null = null;

  if (serviceSecret) {
    const internal = await fetchGatewayWorkspaceState({
      url: `${baseUrl}/player-team/v1/internal/discord/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      serviceSecret,
      viewerId: input.viewerId,
    });
    workspace = internal?.state ?? null;
    viewerAppId = internal?.viewerAppId ?? null;
  } else {
    // Local/dev compatibility only. Production background jobs use the read-only
    // service-authenticated endpoint above and never rely on demo access.
    const viewerState = await fetchState(
      `${baseUrl}/player-team/v1/me/state`,
      input.demoViewerHeader,
      input.viewerId,
    );
    const viewer = asRecord(viewerState?.viewer);
    viewerAppId = asString(viewer?.id);

    workspace = await fetchState(
      `${baseUrl}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      input.demoViewerHeader,
      input.viewerId,
    );
  }

  if (!workspace) return null;

  const members = Array.isArray(workspace.members)
    ? workspace.members.map(asRecord).filter((row): row is LooseRecord => row !== null)
    : [];
  const member = members.find((row) => {
    const discordId = asString(row.discordAccountId);
    const id = asString(row.id);
    return discordId === input.viewerId || id === input.viewerId || (viewerAppId !== null && id === viewerAppId);
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
  const selectedCharacter = characters.find((row) => row.id === selectedCharacterId) ?? null;

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
