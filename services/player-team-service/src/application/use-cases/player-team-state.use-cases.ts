import { PlayerTeamError } from '../../domain/errors.js';
import {
  type PlayerTeamStateRepositoryPort,
  type ViewerSnapshotRecord,
  type ViewerSnapshotUpsertResult,
  type WorkspaceSnapshotRecord,
} from '../../domain/ports/player-team-state.port.js';

export type PlayerTeamDemoAccessConfig = {
  readonly allowDemoWrite: boolean;
};

type WorkspaceRole = 'owner' | 'member' | null;

type PrivateWorkspaceAccess = {
  readonly workspace: Record<string, unknown>;
  readonly viewerAppId: string | null;
  readonly role: WorkspaceRole;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function memberKey(member: Record<string, unknown>): string | null {
  return asString(member.discordAccountId) ?? asString(member.id);
}

function matchesVerifiedViewer(
  member: Record<string, unknown>,
  ownerUserId: string,
  viewerAppId: string | null,
): boolean {
  const discordAccountId = asString(member.discordAccountId);
  if (discordAccountId !== null) return discordAccountId === ownerUserId;
  return viewerAppId !== null && asString(member.id) === viewerAppId;
}

export class PlayerTeamStateUseCases {
  public constructor(
    private readonly repository: PlayerTeamStateRepositoryPort,
    private readonly demoAccess: PlayerTeamDemoAccessConfig,
  ) {}

  /**
   * Validate compatibility access. The web proxy strips browser-provided
   * identity headers and replaces them with the verified Discord account id.
   */
  public assertDemoAccess(demoHeaderValue: string | undefined): string {
    if (!this.demoAccess.allowDemoWrite) {
      throw new PlayerTeamError(
        'DEMO_ACCESS_DENIED',
        'player-team online demo persistence is not enabled',
      );
    }
    if (demoHeaderValue === undefined || demoHeaderValue.trim().length === 0) {
      throw new PlayerTeamError('UNAUTHORIZED', 'missing demo viewer header');
    }
    const trimmed = demoHeaderValue.trim();
    const prefixed = /^discord:(\d{17,20})$/i.exec(trimmed);
    if (prefixed?.[1]) return prefixed[1];
    return trimmed;
  }

  public async getViewerSnapshot(ownerUserId: string): Promise<ViewerSnapshotRecord | null> {
    return this.repository.getViewerSnapshot(ownerUserId);
  }

  public async getViewerSnapshotOrThrow(ownerUserId: string): Promise<ViewerSnapshotRecord> {
    const record = await this.repository.getViewerSnapshot(ownerUserId);
    if (record === null) {
      throw new PlayerTeamError('NOT_FOUND', 'viewer snapshot not found');
    }
    return record;
  }

  public async upsertViewerSnapshot(input: {
    readonly ownerUserId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number | null;
  }): Promise<ViewerSnapshotUpsertResult> {
    return this.repository.upsertViewerSnapshot(input);
  }

  private async privateWorkspaceAccess(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<PrivateWorkspaceAccess> {
    const viewerSnapshot = await this.repository.getViewerSnapshot(ownerUserId);
    if (viewerSnapshot === null) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer state is not available');
    }

    const root = viewerSnapshot.state;
    const viewer = asRecord(root.viewer);
    const viewerAppId = asString(viewer?.id);
    const viewerDiscordId = asString(viewer?.discordAccountId);
    if (viewerDiscordId !== null && viewerDiscordId !== ownerUserId) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer Discord identity mismatch');
    }

    const workspaces = Array.isArray(root.workspaces) ? root.workspaces : [];
    const workspace = workspaces
      .map(asRecord)
      .find((entry) => entry !== null && asString(entry.id) === workspaceId);
    if (workspace === undefined || workspace === null || workspace.archived === true) {
      throw new PlayerTeamError('UNAUTHORIZED', 'workspace is not available to this viewer');
    }

    const members = Array.isArray(workspace.members) ? workspace.members : [];
    const member = members
      .map(asRecord)
      .find(
        (entry) =>
          entry !== null && matchesVerifiedViewer(entry, ownerUserId, viewerAppId),
      );
    if (member === undefined || member === null) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a workspace member');
    }

    const rawRole = asString(member.role);
    const role: WorkspaceRole = rawRole === 'owner' || rawRole === 'member' ? rawRole : null;
    return { workspace, viewerAppId, role };
  }

  /** The shared server snapshot, not the viewer's private snapshot, is authoritative for membership. */
  private sharedRole(
    state: Record<string, unknown>,
    ownerUserId: string,
    viewerAppId: string | null,
  ): WorkspaceRole {
    const members = Array.isArray(state.members) ? state.members : [];
    const member = members
      .map(asRecord)
      .find(
        (entry) =>
          entry !== null && matchesVerifiedViewer(entry, ownerUserId, viewerAppId),
      );
    const role = asString(member?.role);
    return role === 'owner' || role === 'member' ? role : null;
  }

  /**
   * Legacy shared workspaces can contain only the V2 app UUID on a member row.
   * Once the proxy has verified the Discord snowflake for that app UUID, persist the
   * mapping in shared state so downstream DM fan-out no longer depends on a transient
   * request/session fallback.
   */
  private async backfillSharedDiscordIdentity(
    existing: WorkspaceSnapshotRecord,
    ownerUserId: string,
    viewerAppId: string | null,
  ): Promise<WorkspaceSnapshotRecord> {
    if (viewerAppId === null) return existing;
    const rawMembers = Array.isArray(existing.state.members) ? existing.state.members : [];
    let changed = false;
    const members = rawMembers.map((rawMember) => {
      const member = asRecord(rawMember);
      if (member === null || asString(member.id) !== viewerAppId) return rawMember;
      const currentDiscordId = asString(member.discordAccountId);
      if (currentDiscordId !== null) return rawMember;
      changed = true;
      return { ...member, discordAccountId: ownerUserId };
    });
    if (!changed) return existing;

    try {
      return await this.repository.upsertWorkspaceSnapshot({
        workspaceId: existing.workspaceId,
        state: { ...existing.state, members },
        expectedRevision: existing.revision,
        updatedByUserId: ownerUserId,
      });
    } catch (error) {
      if (!(error instanceof PlayerTeamError) || error.code !== 'REVISION_CONFLICT') throw error;
      const raced = await this.repository.getWorkspaceSnapshot(existing.workspaceId);
      if (raced === null || this.sharedRole(raced.state, ownerUserId, viewerAppId) === null) {
        throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a shared workspace member');
      }
      return raced;
    }
  }

  /**
   * A normal member can edit shared gameplay data and their own notify override,
   * but cannot rewrite team identity, roster, roles, invitations or team defaults
   * by submitting a forged whole-workspace snapshot.
   */
  private assertMemberMutationAllowed(input: {
    readonly current: Record<string, unknown>;
    readonly next: Record<string, unknown>;
    readonly ownerUserId: string;
    readonly viewerAppId: string | null;
  }): void {
    const protectedRootFields = ['id', 'name', 'description', 'archived', 'invitations', 'notifyPrefs'];
    for (const field of protectedRootFields) {
      if (!sameJson(input.current[field], input.next[field])) {
        throw new PlayerTeamError('UNAUTHORIZED', `only workspace owner can change ${field}`);
      }
    }

    const currentMembers = (Array.isArray(input.current.members) ? input.current.members : [])
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    const nextMembers = (Array.isArray(input.next.members) ? input.next.members : [])
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    if (currentMembers.length !== nextMembers.length) {
      throw new PlayerTeamError('UNAUTHORIZED', 'only workspace owner can change team roster');
    }

    for (const currentMember of currentMembers) {
      const key = memberKey(currentMember);
      if (key === null) {
        throw new PlayerTeamError('UNAUTHORIZED', 'invalid shared team member');
      }
      const nextMember = nextMembers.find((candidate) => memberKey(candidate) === key);
      if (nextMember === undefined) {
        throw new PlayerTeamError('UNAUTHORIZED', 'only workspace owner can change team roster');
      }

      const isViewer = matchesVerifiedViewer(currentMember, input.ownerUserId, input.viewerAppId);
      if (!isViewer) {
        if (!sameJson(currentMember, nextMember)) {
          throw new PlayerTeamError('UNAUTHORIZED', 'member cannot edit another team member');
        }
        continue;
      }

      const { notifyPrefs: _currentNotify, ...currentProtected } = currentMember;
      const { notifyPrefs: _nextNotify, ...nextProtected } = nextMember;
      void _currentNotify;
      void _nextNotify;
      if (!sameJson(currentProtected, nextProtected)) {
        throw new PlayerTeamError('UNAUTHORIZED', 'member cannot change own role or identity');
      }
    }
  }

  public async getWorkspaceSnapshot(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<WorkspaceSnapshotRecord> {
    const access = await this.privateWorkspaceAccess(ownerUserId, workspaceId);
    const existing = await this.repository.getWorkspaceSnapshot(workspaceId);

    if (existing !== null) {
      if (this.sharedRole(existing.state, ownerUserId, access.viewerAppId) === null) {
        throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a shared workspace member');
      }
      return this.backfillSharedDiscordIdentity(existing, ownerUserId, access.viewerAppId);
    }

    if (access.role !== 'owner') {
      throw new PlayerTeamError('NOT_FOUND', 'shared workspace has not been initialised by owner');
    }

    try {
      return await this.repository.upsertWorkspaceSnapshot({
        workspaceId,
        state: access.workspace,
        expectedRevision: null,
        updatedByUserId: ownerUserId,
      });
    } catch (error) {
      if (!(error instanceof PlayerTeamError) || error.code !== 'REVISION_CONFLICT') throw error;
      const raced = await this.repository.getWorkspaceSnapshot(workspaceId);
      if (
        raced !== null &&
        this.sharedRole(raced.state, ownerUserId, access.viewerAppId) === 'owner'
      ) {
        return this.backfillSharedDiscordIdentity(raced, ownerUserId, access.viewerAppId);
      }
      throw new PlayerTeamError('UNAUTHORIZED', 'workspace id already belongs to another team');
    }
  }

  public async upsertWorkspaceSnapshot(input: {
    readonly ownerUserId: string;
    readonly workspaceId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number | null;
  }): Promise<WorkspaceSnapshotRecord> {
    if (asString(input.state.id) !== input.workspaceId) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'workspace state id does not match route');
    }

    const access = await this.privateWorkspaceAccess(input.ownerUserId, input.workspaceId);
    const existing = await this.repository.getWorkspaceSnapshot(input.workspaceId);

    if (existing === null) {
      if (access.role !== 'owner') {
        throw new PlayerTeamError('UNAUTHORIZED', 'only workspace owner can initialise live state');
      }
    } else {
      const sharedRole = this.sharedRole(existing.state, input.ownerUserId, access.viewerAppId);
      if (sharedRole === null) {
        throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a shared workspace member');
      }
      if (sharedRole === 'member') {
        this.assertMemberMutationAllowed({
          current: existing.state,
          next: input.state,
          ownerUserId: input.ownerUserId,
          viewerAppId: access.viewerAppId,
        });
      }
    }

    return this.repository.upsertWorkspaceSnapshot({
      workspaceId: input.workspaceId,
      state: input.state,
      expectedRevision: input.expectedRevision,
      updatedByUserId: input.ownerUserId,
    });
  }
}
