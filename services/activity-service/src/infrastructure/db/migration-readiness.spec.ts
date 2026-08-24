import { describe, expect, it } from 'vitest';

import { isSchemaMigrationReady, schemaMigrationManifest } from './migration-readiness.js';

describe('migration-readiness', () => {
  it('manifest declares expected activity migration count', () => {
    expect(schemaMigrationManifest.count).toBe(19);
    expect(schemaMigrationManifest.latestId).toBe('019_performance_indexes.sql');
  });

  it('requires foundation, latest, and full count', async () => {
    await expect(
      isSchemaMigrationReady({
        hasSchemaMigration: (id) =>
          Promise.resolve(
            id === schemaMigrationManifest.foundationId || id === schemaMigrationManifest.latestId,
          ),
        countSchemaMigrations: () => Promise.resolve(schemaMigrationManifest.count),
      }),
    ).resolves.toBe(true);

    await expect(
      isSchemaMigrationReady({
        hasSchemaMigration: () => Promise.resolve(true),
        countSchemaMigrations: () => Promise.resolve(schemaMigrationManifest.count - 1),
      }),
    ).resolves.toBe(false);
  });
});
