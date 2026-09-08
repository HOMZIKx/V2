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

type InvitationWorkspaceResult = {
  readonly invitation: PendingInvitation;
  readonly workspaceId: string;
  readonly workspace: WorkspaceRecord;
  readonly revision: number;
};

export async function createTeamInvitation(input: {
  readonly workspaceId: string;
  readonly recipientDiscordId: string;
  readonly recipientDisplayName: string;
}): Promise<InvitationWorkspaceResult> {
  return requestJson<InvitationWorkspaceResult>(
    playerTeamUrl(
      `/player-team/v1/invitations/workspace/${encodeURIComponent(input.workspaceId)}`,
    ),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipientDiscordId: input.recipientDiscordId,
        recipientDisplayName: input.recipientDisplayName,
      }),
    },
  );
}

export async function getTeamInvitation(invitationId: string): Promise<PendingInvitation> {
  return requestJson<PendingInvitation>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}`),
  );
}

export async function acceptTeamInvitation(invitationId: string): Promise<InvitationWorkspaceResult> {
  return requestJson<InvitationWorkspaceResult>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}/accept`),
    { method: 'POST' },
  );
}

export async function declineTeamInvitation(invitationId: string): Promise<{
  readonly invitation: PendingInvitation;
  readonly workspaceId: string;
  readonly revision: number;
}> {
  const result = await requestJson<InvitationWorkspaceResult>(
    playerTeamUrl(`/player-team/v1/invitations/${encodeURIComponent(invitationId)}/decline`),
    { method: 'POST' },
  );
  return {
    invitation: result.invitation,
    workspaceId: result.workspaceId,
    revision: result.revision,
  };
}
