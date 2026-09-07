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

export type WorkspaceSnapshotRecord = {
  readonly workspaceId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
  readonly updatedByUserId: string;
  readonly updatedAtIso: string;
};

export type WorkspaceSnapshotUpsertInput = {
  readonly workspaceId: string;
  readonly state: Record<string, unknown>;
  readonly expectedRevision: number | null;
  readonly updatedByUserId: string;
};

export interface PlayerTeamStateRepositoryPort {
  getViewerSnapshot(ownerUserId: string): Promise<ViewerSnapshotRecord | null>;
  upsertViewerSnapshot(input: ViewerSnapshotUpsertInput): Promise<ViewerSnapshotUpsertResult>;
  getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshotRecord | null>;
  upsertWorkspaceSnapshot(input: WorkspaceSnapshotUpsertInput): Promise<WorkspaceSnapshotRecord>;
  pingDatabase(): Promise<boolean>;
  isMigrationApplied(migrationId: string): Promise<boolean>;
}
