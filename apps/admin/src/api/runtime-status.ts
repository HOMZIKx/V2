import {
  getAdminDependencyDiagnostics,
  type AdminDependencyDiagnostics,
} from './activity-admin.js';
import { getApiBaseUrl } from './http.js';

export type OperatorFlag = 'yes' | 'no' | 'unknown' | 'disabled';

export type OperatorRuntimeStatus = {
  readonly api: OperatorFlag;
  readonly activity: OperatorFlag;
  readonly identity: OperatorFlag;
  readonly discordGateway: OperatorFlag;
  readonly bot: OperatorFlag;
  readonly activityToDiscord: OperatorFlag;
  readonly authorization: OperatorFlag;
  readonly guildInventory: OperatorFlag;
  /** @deprecated Prefer discordGateway — kept for older copy/tests. */
  readonly discord: OperatorFlag;
  readonly apiRevision: string;
  readonly adminRevision: string;
  readonly revision: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  readonly outboxState: string | null;
  readonly activityToDiscordDetail: string | null;
};

function flagFromOk(ok: boolean): OperatorFlag {
  return ok ? 'yes' : 'no';
}

function flagFromReadyState(value: unknown, readyOk: boolean): OperatorFlag {
  if (value === 'ok') {
    return readyOk ? 'yes' : 'no';
  }
  if (value === 'unhealthy') {
    return 'no';
  }
  if (value === true) {
    return readyOk ? 'yes' : 'no';
  }
  if (value === false) {
    return 'no';
  }
  return 'unknown';
}

function flagFromDiscordState(value: unknown): OperatorFlag {
  if (value === 'ready') {
    return 'yes';
  }
  if (value === 'disconnected') {
    return 'no';
  }
  if (value === 'disabled') {
    return 'disabled';
  }
  return 'unknown';
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

export function mapDiscordOperatorFlags(discordState: unknown): {
  readonly discord: OperatorFlag;
  readonly bot: OperatorFlag;
} {
  const flag = flagFromDiscordState(discordState);
  return { discord: flag, bot: flag };
}

function flagFromDependencyProbe(
  value: AdminDependencyDiagnostics[keyof AdminDependencyDiagnostics],
): OperatorFlag {
  if (value === 'ok' || value === 'connected' || value === 'empty') {
    return 'yes';
  }
  if (value === 'disabled') {
    return 'disabled';
  }
  if (
    value === 'unavailable' ||
    value === 'disconnected' ||
    value === 'configuration_invalid' ||
    value === 'unauthorized'
  ) {
    return 'no';
  }
  return 'unknown';
}

function activityToDiscordOwnerDetail(
  value: AdminDependencyDiagnostics['activityToDiscord'],
): string | null {
  if (value === 'configuration_invalid') {
    return 'Błąd konfiguracji połączenia wewnętrznego';
  }
  if (value === 'unauthorized') {
    return 'Odrzucone poświadczenia połączenia wewnętrznego';
  }
  if (value === 'unavailable') {
    return 'Połączenie Activity → Discord niedostępne';
  }
  return null;
}

export async function getOperatorRuntimeStatus(): Promise<OperatorRuntimeStatus> {
  const origin = getApiBaseUrl().replace(/\/$/, '');
  const adminRevision = readAdminRevision();
  try {
    const [liveResponse, readyResponse, dependency] = await Promise.all([
      fetch(`${origin}/health/live`, { credentials: 'include' }),
      fetch(`${origin}/health/ready`, { credentials: 'include' }),
      getAdminDependencyDiagnostics().catch(() => null),
    ]);
    const live = (await liveResponse.json().catch(() => ({}))) as {
      gitCommitSha?: string;
    };
    const ready = (await readyResponse.json().catch(() => ({}))) as {
      checks?: { activity?: unknown; identity?: unknown };
      discord?: { state?: unknown };
      outbox?: { state?: string };
    };
    const apiRevision =
      typeof live.gitCommitSha === 'string' && live.gitCommitSha.length > 0
        ? live.gitCommitSha
        : 'unknown';
    const gatewayFlags = mapDiscordOperatorFlags(ready.discord?.state);
    const discordGateway =
      dependency !== null
        ? flagFromDependencyProbe(dependency.discordGateway)
        : gatewayFlags.discord;
    const bot = dependency !== null ? flagFromDependencyProbe(dependency.bot) : gatewayFlags.bot;
    const activityToDiscord =
      dependency !== null ? flagFromDependencyProbe(dependency.activityToDiscord) : 'unknown';
    const authorization =
      dependency !== null ? flagFromDependencyProbe(dependency.authorization) : 'unknown';
    const guildInventory =
      dependency !== null ? flagFromDependencyProbe(dependency.guildInventory) : 'unknown';
    return {
      api: flagFromOk(liveResponse.ok),
      activity: flagFromReadyState(ready.checks?.activity, readyResponse.ok),
      identity: flagFromReadyState(ready.checks?.identity, readyResponse.ok),
      discordGateway,
      bot,
      activityToDiscord,
      authorization,
      guildInventory,
      discord: discordGateway,
      apiRevision,
      adminRevision,
      revision: compareRevisions(adminRevision, apiRevision),
      outboxState: typeof ready.outbox?.state === 'string' ? ready.outbox.state : null,
      activityToDiscordDetail:
        dependency !== null ? activityToDiscordOwnerDetail(dependency.activityToDiscord) : null,
    };
  } catch {
    return {
      api: 'no',
      activity: 'no',
      identity: 'unknown',
      discordGateway: 'unknown',
      bot: 'unknown',
      activityToDiscord: 'unknown',
      authorization: 'unknown',
      guildInventory: 'unknown',
      discord: 'unknown',
      apiRevision: 'unknown',
      adminRevision,
      revision: 'UNKNOWN',
      outboxState: null,
      activityToDiscordDetail: null,
    };
  }
}
