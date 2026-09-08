import { PlayerTeamError } from '../../domain/errors.js';
import {
  type MetinGeneralHuntRecord,
  type MetinGeneralHuntsRepositoryPort,
  type MetinGeneralHuntState,
} from '../../domain/ports/metin-general-hunts.port.js';

export type MetinGeneralHuntsDemoAccessConfig = {
  readonly allowDemoWrite: boolean;
};

export const METIN_GENERAL_HUNT_KEYS = [
  'metin-red-las',
  'metin-v1',
  'general-v1',
  'metin-v2',
  'general-v2',
] as const;

export type MetinGeneralHuntKey = (typeof METIN_GENERAL_HUNT_KEYS)[number];

export class MetinGeneralHuntsUseCases {
  public constructor(
    private readonly repository: MetinGeneralHuntsRepositoryPort,
    private readonly demoAccess: MetinGeneralHuntsDemoAccessConfig,
  ) {}

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

  public assertHuntKey(huntKey: string): MetinGeneralHuntKey {
    if (!METIN_GENERAL_HUNT_KEYS.includes(huntKey as MetinGeneralHuntKey)) {
      throw new PlayerTeamError('NOT_FOUND', 'metin/general hunt not found');
    }
    return huntKey as MetinGeneralHuntKey;
  }

  public getHunt(huntKey: string): Promise<MetinGeneralHuntRecord> {
    return this.repository.getOrCreateHunt(this.assertHuntKey(huntKey));
  }

  public updateHunt(input: {
    readonly huntKey: string;
    readonly viewerId: string;
    readonly state: MetinGeneralHuntState;
    readonly expectedRevision: number;
  }): Promise<MetinGeneralHuntRecord> {
    const huntKey = this.assertHuntKey(input.huntKey);
    if (input.state.huntKey !== huntKey) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'metin/general hunt state key mismatch');
    }
    return this.repository.updateHunt({ ...input, huntKey });
  }
}
