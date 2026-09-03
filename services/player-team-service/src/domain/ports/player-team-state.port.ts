export type ViewerSnapshotRecord = {
  readonly ownerUserId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
  readonly updatedAtIso: string;
};

export type ViewerSnapshotUpsertInput = {
  readonly ownerUserId: string;
  readonly state: Record<string, unknown>;
  readonly expectedRevision: number | null;
};

export type ViewerSnapshotUpsertResult = {
  readonly revision: number;
};

export interface PlayerTeamStateRepositoryPort {
  getViewerSnapshot(ownerUserId: string): Promise<ViewerSnapshotRecord | null>;
  upsertViewerSnapshot(input: ViewerSnapshotUpsertInput): Promise<ViewerSnapshotUpsertResult>;
  pingDatabase(): Promise<boolean>;
  isMigrationApplied(migrationId: string): Promise<boolean>;
}
