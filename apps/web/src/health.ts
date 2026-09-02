export const createHealthPayload = () => {
  const gitCommitSha =
    process.env.V2_IMAGE_GIT_COMMIT_SHA?.trim() ||
    process.env.ZEABUR_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    'unknown';
  const appVersion = process.env.APP_VERSION?.trim() || '0.0.0-dev';
  return { status: 'ok' as const, gitCommitSha, appVersion };
};
