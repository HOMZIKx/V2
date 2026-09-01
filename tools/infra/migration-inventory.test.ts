import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryScript = path.join(repoRoot, 'tools/scripts/migration-inventory.mjs');

describe('migration inventory (static)', () => {
  it('passes without duplicate numbering', () => {
    const output = execFileSync('node', [inventoryScript], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('Inventory OK');
    expect(output).toContain('identity: 3 migrations');
    expect(output).toContain('authorization: 5 migrations');
    expect(output).toContain('activity: 19 migrations');
  });

  it('manifest files exist for each service', () => {
    for (const service of ['identity', 'authorization', 'activity'] as const) {
      const manifestPath = path.join(
        repoRoot,
        `services/${service}-service/migrations/manifest.json`,
      );
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        count: number;
        foundationId: string;
        latestId: string;
      };
      expect(manifest.count).toBeGreaterThan(0);
      expect(manifest.foundationId.length).toBeGreaterThan(0);
      expect(manifest.latestId.length).toBeGreaterThan(0);
    }
  });
});
