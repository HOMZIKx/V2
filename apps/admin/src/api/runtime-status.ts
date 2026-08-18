import { getApiBaseUrl } from './http.js';

export type OperatorFlag = 'yes' | 'no' | 'unknown';

export type OperatorRuntimeStatus = {
  readonly api: OperatorFlag;
  readonly activity: OperatorFlag;
  readonly identity: OperatorFlag;
  readonly apiRevision: string;
  readonly adminRevision: string;
  readonly revision: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  readonly outboxState: string | null;
};

function flagFromOk(ok: boolean): OperatorFlag {
  return ok ? 'yes' : 'no';
}

function compareRevisions(
  expectedSha: string | undefined,
  runningSha: string | undefined,
): 'MATCH' | 'MISMATCH' | 'UNKNOWN' {
  const expected = expectedSha?.trim() ?? '';
  const running = runningSha?.trim() ?? '';
  if (
    expected.length === 0 ||
    running.length === 0 ||
    running === 'unknown' ||
    expected === 'unknown'
  ) {
    return 'UNKNOWN';
  }
  return expected === running ? 'MATCH' : 'MISMATCH';
}

export function readAdminRevision(): string {
  const value = import.meta.env.VITE_GIT_COMMIT_SHA?.trim();
  return value !== undefined && value.length > 0 ? value : 'unknown';
}

export async function getOperatorRuntimeStatus(): Promise<OperatorRuntimeStatus> {
  const origin = getApiBaseUrl().replace(/\/$/, '');
  const adminRevision = readAdminRevision();
  try {
    const [liveResponse, readyResponse] = await Promise.all([
      fetch(`${origin}/health/live`, { credentials: 'include' }),
      fetch(`${origin}/health/ready`, { credentials: 'include' }),
    ]);
    const live = (await liveResponse.json().catch(() => ({}))) as {
      gitCommitSha?: string;
    };
    const ready = (await readyResponse.json().catch(() => ({}))) as {
      checks?: { activity?: boolean; identity?: boolean };
      outbox?: { state?: string };
    };
    const apiRevision =
      typeof live.gitCommitSha === 'string' && live.gitCommitSha.length > 0
        ? live.gitCommitSha
        : 'unknown';
    return {
      api: flagFromOk(liveResponse.ok),
      activity:
        ready.checks?.activity === undefined
          ? liveResponse.ok
            ? 'unknown'
            : 'no'
          : flagFromOk(ready.checks.activity && readyResponse.ok),
      identity:
        ready.checks?.identity === undefined
          ? 'unknown'
          : flagFromOk(ready.checks.identity && readyResponse.ok),
      apiRevision,
      adminRevision,
      revision: compareRevisions(adminRevision, apiRevision),
      outboxState: typeof ready.outbox?.state === 'string' ? ready.outbox.state : null,
    };
  } catch {
    return {
      api: 'no',
      activity: 'no',
      identity: 'unknown',
      apiRevision: 'unknown',
      adminRevision,
      revision: 'UNKNOWN',
      outboxState: null,
    };
  }
}
