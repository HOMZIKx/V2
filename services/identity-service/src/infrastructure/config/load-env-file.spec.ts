import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvFile, loadIdentityEnvFiles, resolveIdentityEnvFilePaths } from './load-env-file.js';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('loadEnvFile', () => {
  it('loads missing keys from dotenv-style file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'v2-identity-env-'));
    const filePath = path.join(dir, '.env');
    writeFileSync(
      filePath,
      [
        '# comment',
        'V2_IDENTITY_TEST_A=alpha',
        "V2_IDENTITY_TEST_B='beta'",
        'V2_IDENTITY_TEST_C="gamma"',
        '',
      ].join('\n'),
      'utf8',
    );

    delete process.env.V2_IDENTITY_TEST_A;
    delete process.env.V2_IDENTITY_TEST_B;
    delete process.env.V2_IDENTITY_TEST_C;
    process.env.V2_IDENTITY_TEST_A = 'keep';

    loadEnvFile(filePath);

    expect(process.env.V2_IDENTITY_TEST_A).toBe('keep');
    expect(process.env.V2_IDENTITY_TEST_B).toBe('beta');
    expect(process.env.V2_IDENTITY_TEST_C).toBe('gamma');
  });

  it('ignores missing files', () => {
    expect(() => loadEnvFile(path.join(tmpdir(), 'missing-v2-identity-env.env'))).not.toThrow();
  });
});

describe('resolveIdentityEnvFilePaths / loadIdentityEnvFiles', () => {
  it('includes package-relative and monorepo-root candidates', () => {
    const paths = resolveIdentityEnvFilePaths(path.join('repo', 'services', 'identity-service'));
    expect(paths[0]?.endsWith(path.join('services', 'identity-service', '.env'))).toBe(true);
    expect(paths[1]).toBe(
      path.resolve(path.join('repo', 'services', 'identity-service'), '../../.env'),
    );
  });

  it('loads monorepo root .env when cwd is the identity package directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'v2-identity-mono-'));
    const packageDir = path.join(root, 'services', 'identity-service');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(path.join(root, '.env'), 'V2_IDENTITY_SMOKE_ROOT=from-root\n', 'utf8');
    delete process.env.V2_IDENTITY_SMOKE_ROOT;

    loadIdentityEnvFiles(packageDir);

    expect(process.env.V2_IDENTITY_SMOKE_ROOT).toBe('from-root');
  });
});
