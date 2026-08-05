import type {
  AuthorizationStorePort,
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
  SessionRevokePort,
} from '../ports/authorization.ports.js';

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

async function revokeLostEntitlements(
  revoke: SessionRevokePort | null,
  userIds: readonly string[],
): Promise<void> {
  if (revoke === null || userIds.length === 0) {
    return;
  }
  for (const userId of userIds) {
    await revoke.revokeAllSessionsForUser(userId);
  }
}

export async function applyDiscordEvent(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['applyDiscordEvent']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['applyDiscordEvent']>>> {
  const result = await store.applyDiscordEvent(command);
  await revokeLostEntitlements(revoke, result.revokedUserIds);
  return result;
}

export async function reconcileGuild(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['reconcileGuild']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['reconcileGuild']>>> {
  const result = await store.reconcileGuild(command);
  await revokeLostEntitlements(revoke, result.revokedUserIds);
  return result;
}

export async function activateGuild(
  store: AuthorizationStorePort,
  revoke: SessionRevokePort | null,
  command: Parameters<AuthorizationStorePort['activateGuild']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['activateGuild']>>> {
  const result = await store.activateGuild(command);
  await revokeLostEntitlements(revoke, result.revokedUserIds);
  return result;
}

export async function createGrant(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['createGrant']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['createGrant']>>> {
  return store.createGrant(command);
}

export async function createBlock(
  store: AuthorizationStorePort,
  command: Parameters<AuthorizationStorePort['createBlock']>[0],
): Promise<Awaited<ReturnType<AuthorizationStorePort['createBlock']>>> {
  return store.createBlock(command);
}
