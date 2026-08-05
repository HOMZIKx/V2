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
  ReconcileGuildCommand,
  RegisterGuildCommand,
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

  public createGrant(command: CreateGrantCommand): Promise<{ readonly id: string }> {
    return this.repository.createGrant(command);
  }

  public createBlock(command: CreateBlockCommand): Promise<{ readonly id: string }> {
    return this.repository.createBlock(command);
  }
}
