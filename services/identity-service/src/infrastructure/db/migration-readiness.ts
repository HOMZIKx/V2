import { schemaMigrationManifest } from './migration-manifest.generated.js';

export type SchemaMigrationProbe = {
  hasSchemaMigration(migrationId: string): Promise<boolean>;
  countSchemaMigrations(): Promise<number>;
};

export async function isSchemaMigrationReady(probe: SchemaMigrationProbe): Promise<boolean> {
  const [hasFoundation, hasLatest, appliedCount] = await Promise.all([
    probe.hasSchemaMigration(schemaMigrationManifest.foundationId),
    probe.hasSchemaMigration(schemaMigrationManifest.latestId),
    probe.countSchemaMigrations(),
  ]);
  return hasFoundation && hasLatest && appliedCount === schemaMigrationManifest.count;
}

export { schemaMigrationManifest };
