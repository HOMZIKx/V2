export type RuntimeRevision = {
  readonly gitCommitSha: string;
  readonly appVersion: string;
};

export function readRuntimeRevision(env: NodeJS.ProcessEnv = process.env): RuntimeRevision {
  const gitCommitSha = env.GIT_COMMIT_SHA?.trim();
  const appVersion = env.APP_VERSION?.trim();
  return {
    gitCommitSha: gitCommitSha !== undefined && gitCommitSha.length > 0 ? gitCommitSha : 'unknown',
    appVersion: appVersion !== undefined && appVersion.length > 0 ? appVersion : '0.0.0-dev',
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
