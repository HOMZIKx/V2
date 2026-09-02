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

  it('prefers baked image SHA over stale GIT_COMMIT_SHA Variable', () => {
    expect(
      readRuntimeRevision({
        V2_IMAGE_GIT_COMMIT_SHA: 'bakeddeadbeef',
        GIT_COMMIT_SHA: 'staleoldsha',
        APP_VERSION: '0.1.0-zeabur',
      }),
    ).toEqual({
      gitCommitSha: 'bakeddeadbeef',
      appVersion: '0.1.0-zeabur',
    });
  });

  it('ignores empty baked SHA and falls back to GIT_COMMIT_SHA', () => {
    expect(
      readRuntimeRevision({
        V2_IMAGE_GIT_COMMIT_SHA: '   ',
        GIT_COMMIT_SHA: 'fallbacksha',
      }),
    ).toEqual({
      gitCommitSha: 'fallbacksha',
      appVersion: '0.0.0-dev',
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
