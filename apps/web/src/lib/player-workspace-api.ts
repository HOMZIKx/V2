import { ApiClientError, buildApiUrl, parseErrorBody } from './api';
import { getIdentityPublicUrl } from './env';

export class PlayerWorkspaceConflictError extends Error {
  public readonly code = 'CONFLICT';

  public constructor(message: string) {
    super(message);
    this.name = 'PlayerWorkspaceConflictError';
  }
}

export type TeamRoleApi = 'OWNER' | 'MEMBER';
export type MemberStatusApi = 'ACTIVE' | 'REMOVED';
export type InvitationStatusApi = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';

export interface TeamRecordDto {
  readonly id: string;
  readonly name: string;
  readonly createdByUserId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeamMemberRecordDto {
  readonly teamId: string;
  readonly userId: string;
  readonly role: TeamRoleApi;
  readonly status: MemberStatusApi;
  readonly joinedAt: string;
  readonly removedAt: string | null;
}

export interface TeamInvitationRecordDto {
  readonly id: string;
  readonly teamId: string;
  readonly targetUserId: string;
  readonly invitedByUserId: string;
  readonly status: InvitationStatusApi;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly revision: number;
  readonly operationId: string | null;
}

export interface CharacterBoardRecordDto {
  readonly id: string;
  readonly teamId: string;
  readonly displayName: string;
  readonly classSpecKey: string;
  readonly classSpecLabel?: string;
  readonly level: number | null;
  readonly linkedPlayerCharacterId: string | null;
  readonly createdByUserId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly startingSetName?: null;
}

export interface TeamDetailDto {
  readonly team: TeamRecordDto;
  readonly members: readonly TeamMemberRecordDto[];
  readonly invitations: readonly TeamInvitationRecordDto[];
  readonly viewerRole: TeamRoleApi;
}

export interface PendingInvitationDto extends TeamInvitationRecordDto {
  readonly teamName: string;
}

export interface DiscordDirectoryEntryDto {
  readonly v2UserId: string;
  readonly discordUserId: string;
  readonly displayName: string;
  readonly username: string;
  readonly initials: string;
}

export interface IdentityProfileCharacterDto {
  readonly id: string;
  readonly nickname: string;
  readonly classSpecKey: string;
  readonly classSpecLabel: string;
  readonly level: number | null;
  readonly isDefault: boolean;
}

export interface IdentityProfileDto {
  readonly userId: string;
  readonly displayName: string | null;
  readonly characters: readonly IdentityProfileCharacterDto[];
}

async function pwRequest<T>(
  path: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    credentials: 'include',
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    const err = parseErrorBody(parsed);
    if (response.status === 409 || err.code === 'CONFLICT') {
      throw new PlayerWorkspaceConflictError(err.message);
    }
    throw new ApiClientError(err.message, {
      status: response.status,
      code: err.code,
      fields: err.fields,
    });
  }

  return parsed as T;
}

async function identityRequest<T>(
  path: string,
  options: {
    readonly method?: 'GET' | 'POST';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const base = getIdentityPublicUrl().replace(/\/$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    credentials: 'include',
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    const err = parseErrorBody(parsed);
    throw new ApiClientError(err.message, {
      status: response.status,
      code: err.code,
      fields: err.fields,
    });
  }

  return parsed as T;
}

export async function listTeams(signal?: AbortSignal): Promise<readonly TeamRecordDto[]> {
  const raw = await pwRequest<{ teams?: TeamRecordDto[] }>('/player-workspace/v1/teams', {
    ...(signal !== undefined ? { signal } : {}),
  });
  return Array.isArray(raw.teams) ? raw.teams : [];
}

export async function createTeam(name: string, signal?: AbortSignal): Promise<TeamDetailDto> {
  return pwRequest<TeamDetailDto>('/player-workspace/v1/teams', {
    method: 'POST',
    body: { name },
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function getTeamDetail(teamId: string, signal?: AbortSignal): Promise<TeamDetailDto> {
  return pwRequest<TeamDetailDto>(`/player-workspace/v1/teams/${encodeURIComponent(teamId)}`, {
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function createTeamInvitation(
  teamId: string,
  input: {
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
    readonly operationId: string;
  },
  signal?: AbortSignal,
): Promise<TeamInvitationRecordDto> {
  const raw = await pwRequest<{ invitation: TeamInvitationRecordDto }>(
    `/player-workspace/v1/teams/${encodeURIComponent(teamId)}/invitations`,
    {
      method: 'POST',
      body: input,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.invitation;
}

export async function acceptInvitation(
  invitationId: string,
  input: { readonly expectedRevision: number; readonly operationId: string },
  signal?: AbortSignal,
): Promise<TeamInvitationRecordDto> {
  const raw = await pwRequest<{ invitation: TeamInvitationRecordDto }>(
    `/player-workspace/v1/invitations/${encodeURIComponent(invitationId)}/accept`,
    {
      method: 'POST',
      body: input,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.invitation;
}

export async function rejectInvitation(
  invitationId: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<TeamInvitationRecordDto> {
  const raw = await pwRequest<{ invitation: TeamInvitationRecordDto }>(
    `/player-workspace/v1/invitations/${encodeURIComponent(invitationId)}/reject`,
    {
      method: 'POST',
      body: { expectedRevision },
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.invitation;
}

export async function revokeInvitation(
  invitationId: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<TeamInvitationRecordDto> {
  const raw = await pwRequest<{ invitation: TeamInvitationRecordDto }>(
    `/player-workspace/v1/invitations/${encodeURIComponent(invitationId)}/revoke`,
    {
      method: 'POST',
      body: { expectedRevision },
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.invitation;
}

export async function listPendingInvitations(
  signal?: AbortSignal,
): Promise<readonly PendingInvitationDto[]> {
  const raw = await pwRequest<{ invitations?: PendingInvitationDto[] }>(
    '/player-workspace/v1/invitations/pending',
    { ...(signal !== undefined ? { signal } : {}) },
  );
  return Array.isArray(raw.invitations) ? raw.invitations : [];
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
  expectedTeamRevision: number,
  signal?: AbortSignal,
): Promise<void> {
  await pwRequest<unknown>(
    `/player-workspace/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      body: { expectedTeamRevision },
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}

export async function listCharacterBoards(
  teamId: string,
  signal?: AbortSignal,
): Promise<readonly CharacterBoardRecordDto[]> {
  const raw = await pwRequest<{ boards?: CharacterBoardRecordDto[] }>(
    `/player-workspace/v1/teams/${encodeURIComponent(teamId)}/character-boards`,
    { ...(signal !== undefined ? { signal } : {}) },
  );
  return Array.isArray(raw.boards) ? raw.boards : [];
}

export async function getCharacterBoard(
  teamId: string,
  boardId: string,
  signal?: AbortSignal,
): Promise<CharacterBoardRecordDto> {
  const raw = await pwRequest<{ board: CharacterBoardRecordDto }>(
    `/player-workspace/v1/teams/${encodeURIComponent(teamId)}/character-boards/${encodeURIComponent(boardId)}`,
    { ...(signal !== undefined ? { signal } : {}) },
  );
  return raw.board;
}

export async function createCharacterBoard(
  teamId: string,
  input: {
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
    readonly expectedTeamRevision: number;
    readonly operationId: string;
  },
  signal?: AbortSignal,
): Promise<{ readonly board: CharacterBoardRecordDto; readonly teamRevision: number }> {
  return pwRequest(`/player-workspace/v1/teams/${encodeURIComponent(teamId)}/character-boards`, {
    method: 'POST',
    body: input,
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function updateCharacterBoard(
  teamId: string,
  boardId: string,
  input: {
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
    readonly expectedBoardRevision: number;
  },
  signal?: AbortSignal,
): Promise<CharacterBoardRecordDto> {
  const raw = await pwRequest<{ board: CharacterBoardRecordDto }>(
    `/player-workspace/v1/teams/${encodeURIComponent(teamId)}/character-boards/${encodeURIComponent(boardId)}`,
    {
      method: 'PATCH',
      body: input,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.board;
}

export async function resolveDiscordDirectory(
  discordUserId: string,
  signal?: AbortSignal,
): Promise<DiscordDirectoryEntryDto> {
  const raw = await identityRequest<{ entry: DiscordDirectoryEntryDto }>(
    '/identity/v1/directory/resolve-discord',
    {
      method: 'POST',
      body: { discordUserId },
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return raw.entry;
}

export async function getIdentityProfile(signal?: AbortSignal): Promise<IdentityProfileDto> {
  const raw = await identityRequest<{ profile: IdentityProfileDto }>('/identity/v1/profile', {
    ...(signal !== undefined ? { signal } : {}),
  });
  return raw.profile;
}
