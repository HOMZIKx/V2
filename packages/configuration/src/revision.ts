export type RuntimeRevision = {
  readonly gitCommitSha: string;
  readonly appVersion: string;
};

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0 && trimmed !== 'unknown') {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Resolve the running image revision.
 *
 * Prefer `V2_IMAGE_GIT_COMMIT_SHA` (baked from Zeabur `ZEABUR_GIT_COMMIT_SHA` at
 * Docker build) over a manual `GIT_COMMIT_SHA` Variable — the latter often goes
 * stale across redeploys and makes Discord `/status` lie about the image.
 */
export function readRuntimeRevision(env: NodeJS.ProcessEnv = process.env): RuntimeRevision {
  const gitCommitSha =
    firstNonEmpty(env.V2_IMAGE_GIT_COMMIT_SHA, env.ZEABUR_GIT_COMMIT_SHA, env.GIT_COMMIT_SHA) ??
    'unknown';
  const appVersion = firstNonEmpty(env.APP_VERSION) ?? '0.0.0-dev';
  return {
    gitCommitSha,
    appVersion,
  };
}

export function compareRevisions(
  expectedSha: string | undefined,
  runningSha: string | undefined,
): 'MATCH' | 'MISMATCH' | 'UNKNOWN' {
  const expected = expectedSha?.trim() ?? '';
  const running = runningSha?.trim() ?? '';
  if (expected.length === 0 || running.length === 0 || running === 'unknown') {
    return 'UNKNOWN';
  }
  return expected === running ? 'MATCH' : 'MISMATCH';
}
