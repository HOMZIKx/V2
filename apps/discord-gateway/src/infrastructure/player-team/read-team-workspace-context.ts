import {
  confirmKingdomWarClaimForUser,
  consumeKingdomWarScopeTokenForUser,
  discardPendingKingdomWarClaim,
  encodeKingdomWarScopedCharacterId,
} from '../../application/notify/kingdom-war-claims.js';
import { resolveTeamKingdomWarWorkspaceId } from '../../application/notify/kingdom-war-team-recipients.js';
import { ownerViewerIdCandidates } from './owner-viewer-id.js';

export type TeamWorkspaceContext = {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly recipients: readonly string[];
  readonly roster: readonly { readonly id: string; readonly name: string }[];
};

type LooseRecord = Record<string, unknown>;
type NotifyPreference = 'kingdomWar';

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && /^\d{17,20}$/.test(value.trim());
}

function booleanField(record: LooseRecord | null, key: string): boolean | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function memberNotifyEnabled(
  workspace: LooseRecord,
  member: LooseRecord,
  preference: NotifyPreference,
): boolean {
  const teamPrefs = asRecord(workspace.notifyPrefs);
  const memberPrefs = asRecord(member.notifyPrefs);
  const personal = booleanField(memberPrefs, preference);
  if (personal !== null) return personal;
  const teamDefault = booleanField(teamPrefs, preference);
  return teamDefault ?? true;
}

function contextFromWorkspace(
  workspace: LooseRecord,
  viewerDiscordId: string,
  recipientPreference?: NotifyPreference,
): TeamWorkspaceContext | null {
  if (typeof workspace.id !== 'string' || workspace.archived === true) return null;

  const recipients = new Set<string>();
  if (!recipientPreference && isSnowflake(viewerDiscordId)) recipients.add(viewerDiscordId.trim());
  if (Array.isArray(workspace.members)) {
    for (const raw of workspace.members) {
      const member = asRecord(raw);
      if (!member) continue;
      if (recipientPreference && !memberNotifyEnabled(workspace, member, recipientPreference)) continue;
      if (isSnowflake(member.discordAccountId)) recipients.add(member.discordAccountId.trim());
      else if (isSnowflake(member.id)) recipients.add(member.id.trim());
    }
  }

  const roster: { id: string; name: string }[] = [];
  if (Array.isArray(workspace.characters)) {
    for (const raw of workspace.characters) {
      const character = asRecord(raw);
      if (!character || character.archived === true || typeof character.id !== 'string') continue;
      const name = typeof character.name === 'string' ? character.name.trim() : character.id;
      if (!name) continue;
      roster.push({ id: character.id, name });
      if (roster.length >= 20) break;
    }
  }

  return {
    workspaceId: workspace.id,
    workspaceName:
      typeof workspace.name === 'string' && workspace.name.trim() ? workspace.name.trim() : workspace.id,
    recipients: [...recipients],
    roster,
  };
}

function scopeWarRoster(context: TeamWorkspaceContext): TeamWorkspaceContext {
  return {
    ...context,
    roster: context.roster.map((character) => ({
      ...character,
      id: encodeKingdomWarScopedCharacterId(context.workspaceId, character.id),
    })),
  };
}

async function readSharedWorkspace(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
}): Promise<LooseRecord | null> {
  try {
    const response = await fetch(
      `${input.baseUrl.replace(/\/$/, '')}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      {
        method: 'GET',
        headers: { [input.demoViewerHeader]: input.viewerId },
        cache: 'no-store',
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { readonly state?: unknown };
    return asRecord(body.state);
  } catch {
    return null;
  }
}

async function readExactWarContext(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly confirmPendingClaim?: boolean;
}): Promise<TeamWorkspaceContext | null> {
  for (const candidate of ownerViewerIdCandidates(input.viewerId)) {
    const shared = await readSharedWorkspace({ ...input, viewerId: candidate });
    if (!shared) continue;
    const context = contextFromWorkspace(shared, input.viewerId, 'kingdomWar');
    if (!context || context.workspaceId !== input.workspaceId) continue;
    if (input.confirmPendingClaim && !confirmKingdomWarClaimForUser(input.viewerId)) {
      return null;
    }
    return scopeWarRoster(context);
  }
  if (input.confirmPendingClaim) discardPendingKingdomWarClaim(input.viewerId);
  return null;
}

/** Exact team context for scheduler delivery; never falls back to another workspace. */
export async function readSharedKingdomWarWorkspaceContext(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
}): Promise<TeamWorkspaceContext | null> {
  return readExactWarContext(input);
}

/**
 * Resolve the user's currently opened team, then prefer its shared workspace state.
 * A signed kingdom-war button leaves a short-lived scope hint; in that case this
 * function MUST resolve that exact workspace and must not fall through to another team.
 */
export async function readTeamWorkspaceContextFromBot(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
}): Promise<TeamWorkspaceContext | null> {
  const warScopeToken = consumeKingdomWarScopeTokenForUser(input.viewerId);
  if (warScopeToken) {
    const workspaceId = resolveTeamKingdomWarWorkspaceId(warScopeToken);
    if (!workspaceId) {
      discardPendingKingdomWarClaim(input.viewerId);
      return null;
    }
    return readExactWarContext({ ...input, workspaceId, confirmPendingClaim: true });
  }

  const url = `${input.baseUrl.replace(/\/$/, '')}/player-team/v1/me/state`;

  for (const candidate of ownerViewerIdCandidates(input.viewerId)) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [input.demoViewerHeader]: candidate },
        cache: 'no-store',
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return null;
      continue;
    }

    const body = (await response.json()) as { readonly state?: unknown };
    const state = asRecord(body.state);
    if (!state || !Array.isArray(state.workspaces)) continue;
    const workspaces = state.workspaces
      .map(asRecord)
      .filter((row): row is LooseRecord => row !== null && row.archived !== true);
    if (workspaces.length === 0) continue;

    const preferredId =
      typeof state.lastOpenedWorkspaceId === 'string' ? state.lastOpenedWorkspaceId : null;
    const located =
      (preferredId ? workspaces.find((workspace) => workspace.id === preferredId) : null) ??
      workspaces[0] ??
      null;
    if (!located || typeof located.id !== 'string') continue;

    const shared = await readSharedWorkspace({
      baseUrl: input.baseUrl,
      demoViewerHeader: input.demoViewerHeader,
      viewerId: candidate,
      workspaceId: located.id,
    });
    return contextFromWorkspace(shared ?? located, input.viewerId);
  }

  return null;
}

export async function readSharedWorkspaceTeamRecipients(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
}): Promise<readonly string[]> {
  const shared = await readSharedWorkspace(input);
  if (!shared) return isSnowflake(input.viewerId) ? [input.viewerId] : [];
  return contextFromWorkspace(shared, input.viewerId)?.recipients ?? [];
}
