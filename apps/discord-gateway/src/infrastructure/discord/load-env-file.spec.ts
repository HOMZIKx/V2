import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvFile } from './load-env-file.js';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('loadEnvFile', () => {
  it('loads missing keys from dotenv-style file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'v2-env-'));
    const filePath = path.join(dir, '.env');
    writeFileSync(
      filePath,
      [
        '# comment',
        'V2_TEST_ENV_A=alpha',
        "V2_TEST_ENV_B='beta'",
        'V2_TEST_ENV_C="gamma"',
        '',
      ].join('\n'),
      'utf8',
    );

    delete process.env.V2_TEST_ENV_A;
    delete process.env.V2_TEST_ENV_B;
    delete process.env.V2_TEST_ENV_C;
    process.env.V2_TEST_ENV_A = 'keep';

    loadEnvFile(filePath);

    expect(process.env.V2_TEST_ENV_A).toBe('keep');
    expect(process.env.V2_TEST_ENV_B).toBe('beta');
    expect(process.env.V2_TEST_ENV_C).toBe('gamma');
  });

  it('ignores missing files', () => {
    expect(() => loadEnvFile(path.join(tmpdir(), 'missing-v2-env-file.env'))).not.toThrow();
  });
});
