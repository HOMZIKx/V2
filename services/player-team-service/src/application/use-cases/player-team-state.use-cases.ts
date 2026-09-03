import { PlayerTeamError } from '../../domain/errors.js';
import {
  type PlayerTeamStateRepositoryPort,
  type ViewerSnapshotRecord,
  type ViewerSnapshotUpsertResult,
} from '../../domain/ports/player-team-state.port.js';

export type PlayerTeamDemoAccessConfig = {
  readonly allowDemoWrite: boolean;
};

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
    return demoHeaderValue.trim();
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
}
