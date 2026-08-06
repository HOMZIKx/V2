import type {
  AuthorizationStorePort,
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
  SessionRevokePort,
} from '../ports/authorization.ports.js';

export interface DeliverPendingRevokesResult {
  readonly delivered: number;
  readonly failed: number;
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

/**
 * Drain the durable `pending_session_revoke` queue: for each pending row call
 * Identity's system revoke, marking the row delivered on success or recording a
 * failed attempt (row stays pending) so a later drain retries it. The queue —
 * written inside each mutation transaction — is the crash-safe source of truth;
 * this drain is what actually kills sessions. It is safe to call repeatedly and
 * even when a mutation was a duplicate (there may be un-delivered rows from an
 * earlier crashed drain).
 */
export async function deliverPendingRevokes(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  limit?: number,
): Promise<DeliverPendingRevokesResult> {
  if (revoke === null) {
    return { delivered: 0, failed: 0 };
  }

  const pending = await store.listPendingSessionRevokes(limit);
  let delivered = 0;
  let failed = 0;

  for (const record of pending) {
    try {
      await revoke.revokeAllSessionsForUser(record.v2UserId, record.correlationId, record.reason);
      await store.markSessionRevokeDelivered(record.id);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.markSessionRevokeAttemptFailed(record.id, message);
      failed += 1;
    }
  }

  return { delivered, failed };
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
