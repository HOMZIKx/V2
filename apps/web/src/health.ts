export const createHealthPayload = () => {
  const gitCommitSha = process.env.GIT_COMMIT_SHA?.trim() || 'unknown';
  const appVersion = process.env.APP_VERSION?.trim() || '0.0.0-dev';
  return { status: 'ok' as const, gitCommitSha, appVersion };
};
