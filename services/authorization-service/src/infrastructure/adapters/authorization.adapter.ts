import type {
  ActivateGuildCommand,
  ApplyDiscordEventCommand,
  ApplyDiscordEventResult,
  AuthorizationStorePort,
  AuthorizeCommand,
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
  CreateBlockCommand,
  CreateGrantCommand,
  EnsureOrganizationResult,
  IdentityLinkResult,
  PendingSessionRevokeRecord,
  PolicyMutationResult,
  ReconcileGuildCommand,
  RegisterGuildCommand,
  SetGuildLoginEntitlingCommand,
  UpsertIdentityLinkCommand,
} from '../../application/ports/authorization.ports.js';
import type {
  AuthorizationExplanation,
  ConnectedGuildState,
} from '../../domain/decision-engine.js';
import type { AuthorizationRepository } from '../persistence/authorization-repository.js';

/**
 * Infrastructure adapter exposing {@link AuthorizationStorePort} over the
 * PostgreSQL repository. Keeps Nest and `pg` out of application use-cases.
 */
export class AuthorizationAdapter implements AuthorizationStorePort {
  public constructor(private readonly repository: AuthorizationRepository) {}

  public ensureOrganization(preferredId?: string): Promise<EnsureOrganizationResult> {
    return this.repository.ensureOrganization(preferredId);
  }

  public ping(): Promise<void> {
    return this.repository.ping();
  }

  public bootstrapOwner(command: BootstrapOwnerCommand): Promise<BootstrapOwnerResult> {
    return this.repository.bootstrapOwner(command);
  }

  public upsertIdentityLink(command: UpsertIdentityLinkCommand): Promise<IdentityLinkResult> {
    return this.repository.upsertIdentityLink(command);
  }

  public authorize(command: AuthorizeCommand): Promise<AuthorizationExplanation> {
    return this.repository.authorize(command);
  }

  public registerGuild(command: RegisterGuildCommand): Promise<ConnectedGuildState> {
    return this.repository.registerGuild(command);
  }

  public applyDiscordEvent(command: ApplyDiscordEventCommand): Promise<ApplyDiscordEventResult> {
    return this.repository.applyDiscordEvent(command);
  }

  public reconcileGuild(command: ReconcileGuildCommand): Promise<ApplyDiscordEventResult> {
    return this.repository.reconcileGuild(command);
  }

  public activateGuild(command: ActivateGuildCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }> {
    return this.repository.activateGuild(command);
  }

  public setGuildLoginEntitling(command: SetGuildLoginEntitlingCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }> {
    return this.repository.setGuildLoginEntitling(command);
  }

  public createGrant(command: CreateGrantCommand): Promise<PolicyMutationResult> {
    return this.repository.createGrant(command);
  }

  public createBlock(command: CreateBlockCommand): Promise<PolicyMutationResult> {
    return this.repository.createBlock(command);
  }

  public listPendingSessionRevokes(limit?: number): Promise<readonly PendingSessionRevokeRecord[]> {
    return this.repository.listPendingSessionRevokes(limit);
  }

  public markSessionRevokeDelivered(id: string): Promise<void> {
    return this.repository.markSessionRevokeDelivered(id);
  }

  public markSessionRevokeAttemptFailed(id: string, errorMessage: string): Promise<void> {
    return this.repository.markSessionRevokeAttemptFailed(id, errorMessage);
  }

  public processExpiredPolicies(
    now?: Date,
  ): Promise<{ readonly revokedUserIds: readonly string[] }> {
    return this.repository.processExpiredPolicies(now);
  }
}
