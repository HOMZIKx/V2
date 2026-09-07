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

type PrivateWorkspaceAccess = {
  readonly workspace: Record<string, unknown>;
  readonly viewerAppId: string | null;
  readonly role: 'owner' | 'member' | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export class PlayerTeamStateUseCases {
  public constructor(
    private readonly repository: PlayerTeamStateRepositoryPort,
    private readonly demoAccess: PlayerTeamDemoAccessConfig,
  ) {}

  /**
   * Validate demo-mode access. Returns the resolved owner user id.
   * In dev-safe mode the viewer identity is carried in a request header.
   * This will be replaced by proper identity/auth wiring in a later phase.
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
    // Canonical owner key: bare Discord snowflake (strip legacy discord: prefix).
    const trimmed = demoHeaderValue.trim();
    const prefixed = /^discord:(\d{17,20})$/i.exec(trimmed);
    if (prefixed?.[1]) {
      return prefixed[1];
    }
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
      .find((entry) => {
        if (entry === null) return false;
        const memberDiscordId = asString(entry.discordAccountId);
        const memberId = asString(entry.id);
        return memberDiscordId === ownerUserId || (viewerAppId !== null && memberId === viewerAppId);
      });
    if (member === undefined || member === null) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a workspace member');
    }

    const rawRole = asString(member.role);
    const role = rawRole === 'owner' || rawRole === 'member' ? rawRole : null;
    return { workspace, viewerAppId, role };
  }

  private sharedStateAllowsViewer(
    state: Record<string, unknown>,
    ownerUserId: string,
    viewerAppId: string | null,
  ): boolean {
    const members = Array.isArray(state.members) ? state.members : [];
    const memberMatch = members
      .map(asRecord)
      .some((entry) => {
        if (entry === null) return false;
        return (
          asString(entry.discordAccountId) === ownerUserId ||
          (viewerAppId !== null && asString(entry.id) === viewerAppId)
        );
      });
    if (memberMatch) return true;

    const invitations = Array.isArray(state.invitations) ? state.invitations : [];
    return invitations
      .map(asRecord)
      .some((entry) => {
        if (entry === null || asString(entry.recipientDiscordId) !== ownerUserId) return false;
        const status = asString(entry.status);
        return status === 'pending' || status === 'accepted';
      });
  }

  public async getWorkspaceSnapshot(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<WorkspaceSnapshotRecord> {
    const access = await this.privateWorkspaceAccess(ownerUserId, workspaceId);
    const existing = await this.repository.getWorkspaceSnapshot(workspaceId);

    if (existing !== null) {
      if (
        access.role !== 'owner' &&
        !this.sharedStateAllowsViewer(existing.state, ownerUserId, access.viewerAppId)
      ) {
        throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not authorised for shared workspace');
      }
      return existing;
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
      if (raced !== null) return raced;
      throw error;
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
    } else if (
      access.role !== 'owner' &&
      !this.sharedStateAllowsViewer(existing.state, input.ownerUserId, access.viewerAppId)
    ) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not authorised for shared workspace');
    }

    return this.repository.upsertWorkspaceSnapshot({
      workspaceId: input.workspaceId,
      state: input.state,
      expectedRevision: input.expectedRevision,
      updatedByUserId: input.ownerUserId,
    });
  }
}
