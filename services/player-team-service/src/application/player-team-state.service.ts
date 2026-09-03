import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';

@Injectable()
export class PlayerTeamStateService {
  // MVP: store whole PlayerStoreState snapshot as JSONB in the same table
  // used for workspace snapshots. Later we'll introduce a proper schema.
  public static readonly VIEWER_STATE_WORKSPACE_ID = '__viewer-player-store-state__';

  public constructor(
    private readonly repository: PlayerTeamStateRepository,
    private readonly env: PlayerTeamEnv,
  ) {}

  public assertDemoAccessOrThrow(input: { readonly demoHeaderValue: string | undefined }): string {
    if (!this.env.PLAYER_TEAM_ALLOW_DEMO_WRITE) {
      throw new ForbiddenException('player-team online demo persistence disabled');
    }
    if (!input.demoHeaderValue || input.demoHeaderValue.trim().length === 0) {
      throw new UnauthorizedException('missing demo viewer header');
    }
    return input.demoHeaderValue.trim();
  }

  public async listWorkspacesForOwner(ownerUserId: string) {
    return this.repository.listWorkspacesForOwner(ownerUserId);
  }

  public async getWorkspaceStateOrThrow(input: { readonly ownerUserId: string; readonly workspaceId: string }) {
    const state = await this.repository.getWorkspaceState(input.ownerUserId, input.workspaceId);
    if (state === null) throw new NotFoundException('workspace not found');
    return state;
  }

  public async upsertWorkspaceState(input: {
    readonly ownerUserId: string;
    readonly workspaceId: string;
    readonly state: unknown;
    readonly expectedRevision: number | null;
  }) {
    return this.repository.upsertWorkspaceState({
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      state: input.state,
      expectedRevision: input.expectedRevision,
    });
  }

  public async getViewerStateOrNull(input: { readonly ownerUserId: string }) {
    return this.repository.getWorkspaceState(input.ownerUserId, PlayerTeamStateService.VIEWER_STATE_WORKSPACE_ID);
  }

  public async upsertViewerState(input: {
    readonly ownerUserId: string;
    readonly state: unknown;
    readonly expectedRevision: number | null;
  }) {
    return this.repository.upsertWorkspaceState({
      ownerUserId: input.ownerUserId,
      workspaceId: PlayerTeamStateService.VIEWER_STATE_WORKSPACE_ID,
      state: input.state,
      expectedRevision: input.expectedRevision,
    });
  }
}

