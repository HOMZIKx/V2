import { describe, expect, it } from 'vitest';

import { compareRevisions, readRuntimeRevision } from './revision.js';

describe('readRuntimeRevision', () => {
  it('returns unknown when GIT_COMMIT_SHA is missing', () => {
    expect(readRuntimeRevision({})).toEqual({
      gitCommitSha: 'unknown',
      appVersion: '0.0.0-dev',
    });
  });

  it('reads trimmed commit and version', () => {
    expect(
      readRuntimeRevision({
        GIT_COMMIT_SHA: ' abc1234 ',
        APP_VERSION: ' 1.2.3 ',
      }),
    ).toEqual({
      gitCommitSha: 'abc1234',
      appVersion: '1.2.3',
    });
  });
});

describe('compareRevisions', () => {
  it('matches identical SHAs', () => {
    expect(compareRevisions('abc', 'abc')).toBe('MATCH');
  });

  it('reports mismatch', () => {
    expect(compareRevisions('abc', 'def')).toBe('MISMATCH');
  });

  it('reports unknown when running SHA is absent', () => {
    expect(compareRevisions('abc', 'unknown')).toBe('UNKNOWN');
    expect(compareRevisions('abc', undefined)).toBe('UNKNOWN');
  });
});
