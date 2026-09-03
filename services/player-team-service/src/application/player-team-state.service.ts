import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../interface/player-team.tokens.js';

@Injectable()
export class PlayerTeamStateService {
  public constructor(
    private readonly repository: PlayerTeamStateRepository,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  /**
   * Validate demo-mode access. Returns the resolved owner user id.
   * In dev-safe mode the viewer identity is carried in a request header.
   * This will be replaced by proper identity/auth wiring in a later phase.
   */
  public assertDemoAccessOrThrow(input: { readonly demoHeaderValue: string | undefined }): string {
    if (!this.env.PLAYER_TEAM_ALLOW_DEMO_WRITE) {
      throw new ForbiddenException('player-team online demo persistence is not enabled');
    }
    if (!input.demoHeaderValue || input.demoHeaderValue.trim().length === 0) {
      throw new UnauthorizedException('missing demo viewer header');
    }
    return input.demoHeaderValue.trim();
  }

  public async getViewerSnapshotOrNull(input: { readonly ownerUserId: string }) {
    return this.repository.getViewerSnapshot(input.ownerUserId);
  }

  public async getViewerSnapshotOrThrow(input: { readonly ownerUserId: string }) {
    const record = await this.repository.getViewerSnapshot(input.ownerUserId);
    if (record === null) throw new NotFoundException('viewer snapshot not found');
    return record;
  }

  public async upsertViewerSnapshot(input: {
    readonly ownerUserId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number | null;
  }) {
    return this.repository.upsertViewerSnapshot(input);
  }
}
