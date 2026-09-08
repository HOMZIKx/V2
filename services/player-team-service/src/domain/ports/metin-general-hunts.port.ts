export type MetinGeneralHuntState = Record<string, unknown>;

export type MetinGeneralHuntRecord = {
  readonly huntKey: string;
  readonly state: MetinGeneralHuntState;
  readonly revision: number;
  readonly updatedByUserId: string | null;
  readonly updatedAtIso: string;
};

export type UpdateMetinGeneralHuntInput = {
  readonly huntKey: string;
  readonly viewerId: string;
  readonly state: MetinGeneralHuntState;
  readonly expectedRevision: number;
};

export interface MetinGeneralHuntsRepositoryPort {
  getOrCreateHunt(huntKey: string): Promise<MetinGeneralHuntRecord>;
  updateHunt(input: UpdateMetinGeneralHuntInput): Promise<MetinGeneralHuntRecord>;
}
