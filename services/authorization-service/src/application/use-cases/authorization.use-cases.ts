import type {
  AuthorizationStorePort,
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
  ClaimPendingRevokesOptions,
  SessionRevokePort,
} from '../ports/authorization.ports.js';

export interface DeliverPendingRevokesResult {
  readonly delivered: number;
  readonly failed: number;
  readonly terminalFailed: number;
}

const DEFAULT_MAX_ATTEMPTS = 25;

/**
 * Drain the durable `pending_session_revoke` queue: claim rows with a lease,
 * call Identity's system revoke, mark delivered on success or record a failed
 * attempt with backoff. Safe for concurrent instances via SKIP LOCKED.
 */
export async function deliverPendingRevokes(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  options?: {
    readonly limit?: number;
    readonly leaseOwner?: string;
    readonly leaseSeconds?: number;
    readonly maxAttempts?: number;
  },
): Promise<DeliverPendingRevokesResult> {
  if (revoke === null) {
    return { delivered: 0, failed: 0, terminalFailed: 0 };
  }

  const leaseOwner = options?.leaseOwner ?? `drain:${process.pid}`;
  const claim: ClaimPendingRevokesOptions = {
    leaseOwner,
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
    ...(options?.leaseSeconds !== undefined ? { leaseSeconds: options.leaseSeconds } : {}),
  };

  const pending =
    typeof store.claimPendingSessionRevokes === 'function'
      ? await store.claimPendingSessionRevokes(claim)
      : await store.listPendingSessionRevokes(options?.limit);

  let delivered = 0;
  let failed = 0;
  let terminalFailed = 0;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (const record of pending) {
    try {
      await revoke.revokeAllSessionsForUser(record.v2UserId, record.correlationId, record.reason);
      await store.markSessionRevokeDelivered(record.id, leaseOwner);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = record.attempts + 1;
      const terminal = nextAttempts >= maxAttempts;
      await store.markSessionRevokeAttemptFailed({
        id: record.id,
        errorMessage: message,
        terminal,
        actor: leaseOwner,
      });
      if (terminal) {
        terminalFailed += 1;
      } else {
        failed += 1;
      }
    }
  }

  return { delivered, failed, terminalFailed };
}

export async function bootstrapOwner(
  store: AuthorizationStorePort,
  command: BootstrapOwnerCommand,
): Promise<BootstrapOwnerResult> {
  return store.bootstrapOwner(command);
}

export async function upsertIdentityLink(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['upsertIdentityLink']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['upsertIdentityLink']>>> {
  return store.upsertIdentityLink(command);
}

export async function authorize(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['authorize']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['authorize']>>> {
  return store.authorize(command);
}

export async function explainAuthorization(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['authorize']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['authorize']>>> {
  return store.authorize(command);
}

export async function registerGuild(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['registerGuild']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['registerGuild']>>> {
  return store.registerGuild(command);
}

export async function applyDiscordEvent(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['applyDiscordEvent']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['applyDiscordEvent']>>> {
  const result = await store.applyDiscordEvent(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function reconcileGuild(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['reconcileGuild']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['reconcileGuild']>>> {
  const result = await store.reconcileGuild(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function activateGuild(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['activateGuild']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['activateGuild']>>> {
  const result = await store.activateGuild(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function setGuildLoginEntitling(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['setGuildLoginEntitling']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['setGuildLoginEntitling']>>> {
  const result = await store.setGuildLoginEntitling(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function createGrant(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['createGrant']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['createGrant']>>> {
  const result = await store.createGrant(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function createBlock(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['createBlock']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['createBlock']>>> {
  const result = await store.createBlock(command);
  await deliverPendingRevokes(store, revoke);
  return result;
}

export async function processExpiredPolicies(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  now?: Date,
): Promise<Awaited<ReturnType<AuthorizationStorePort['processExpiredPolicies']>>> {
  const result = await store.processExpiredPolicies(now);
  await deliverPendingRevokes(store, revoke);
  return result;
}

/** One maintenance tick: expirations then pending revoke delivery. */
export async function runMaintenanceTick(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  options?: {
    readonly leaseOwner?: string;
    readonly revokeLimit?: number;
    readonly now?: Date;
  },
): Promise<{
  readonly expirations: Awaited<ReturnType<AuthorizationStorePort['processExpiredPolicies']>>;
  readonly revokes: DeliverPendingRevokesResult;
}> {
  const expirations = await store.processExpiredPolicies(options?.now);
  const revokes = await deliverPendingRevokes(store, revoke, {
    ...(options?.leaseOwner !== undefined ? { leaseOwner: options.leaseOwner } : {}),
    ...(options?.revokeLimit !== undefined ? { limit: options.revokeLimit } : {}),
  });
  return { expirations, revokes };
}
