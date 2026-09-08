import type { PendingInvitation, WorkspaceRecord } from './player-store';

const configuredBaseUrl =
  process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim();
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

function playerTeamUrl(path: string): string {
  return `${baseUrl}${path}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`team invitation request failed: ${response.status} ${body}`.trim());
  }
  return (await response.json()) as T;
}

export async function getTeamInvitation(invitationId: string): Promise<PendingInvitation> {
  return requestJson<PendingInvitation>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}`),
  );
}

export async function acceptTeamInvitation(invitationId: string): Promise<{
  readonly invitation: PendingInvitation;
  readonly workspaceId: string;
  readonly workspace: WorkspaceRecord;
  readonly revision: number;
}> {
  const result = await requestJson<{
    readonly invitation: PendingInvitation;
    readonly workspaceId: string;
    readonly workspace: WorkspaceRecord | null;
    readonly revision: number;
  }>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}/accept`),
    { method: 'POST' },
  );
  if (!result.workspace) {
    throw new Error('team invitation accept returned no workspace');
  }
  return { ...result, workspace: result.workspace };
}

export async function declineTeamInvitation(invitationId: string): Promise<{
  readonly invitation: PendingInvitation;
  readonly workspaceId: string;
  readonly revision: number;
}> {
  const result = await requestJson<{
    readonly invitation: PendingInvitation;
    readonly workspaceId: string;
    readonly workspace: WorkspaceRecord | null;
    readonly revision: number;
  }>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}/decline`),
    { method: 'POST' },
  );
  return {
    invitation: result.invitation,
    workspaceId: result.workspaceId,
    revision: result.revision,
  };
}
