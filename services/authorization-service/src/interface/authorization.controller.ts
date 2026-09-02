import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type {
  AuthorizationStorePort,
  DiscordEventPayload,
  MemberSnapshot,
  RoleSnapshot,
  SessionRevokePort,
} from '../application/ports/authorization.ports.js';
import * as useCases from '../application/use-cases/authorization.use-cases.js';
import type { DecisionSubject } from '../domain/decision-engine.js';
import { AuthorizationError } from '../domain/errors.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import { AuthorizationExceptionFilter } from './authorization-exception.filter.js';
import {
  AUTHORIZATION_CONFIG,
  AUTHORIZATION_STORE_PORT,
  SESSION_REVOKE_PORT,
} from './authorization.tokens.js';
import {
  type AuthenticatedRequest,
  InboundAssertionGuard,
  RequireOperation,
} from './inbound-assertion.guard.js';

const subjectSchema = z
  .object({
    v2UserId: z.string().min(1).max(128).optional(),
    discordUserId: z.string().min(1).max(128).optional(),
  })
  .refine((value) => value.v2UserId !== undefined || value.discordUserId !== undefined, {
    message: 'At least one of v2UserId or discordUserId is required',
  });

const scopeSchema = z
  .object({
    type: z.enum(['organization', 'guild']),
    guildId: z.string().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'guild' && value.guildId === undefined) {
      ctx.addIssue({ code: 'custom', message: 'guildId is required for guild scope' });
    }
    if (value.type === 'organization' && value.guildId !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'guildId must be omitted for organization scope' });
    }
  });

const authorizeBodySchema = z.object({
  subject: subjectSchema,
  permissionId: z.string().min(1).max(256),
  scope: scopeSchema,
  operationClass: z.enum(['ordinary', 'sensitive']).default('ordinary'),
});

const bootstrapBodySchema = z.object({
  discordUserId: z.string().min(1).max(128),
  v2UserId: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).max(256).optional(),
  correlationId: z.string().min(1).max(128).optional(),
});

const identityLinkBodySchema = z.object({
  discordUserId: z.string().min(1).max(128),
  v2UserId: z.string().min(1).max(128),
});

const registerGuildBodySchema = z.object({
  discordGuildId: z.string().min(1).max(128),
});

const memberSnapshotSchema = z
  .object({
    discordUserId: z.string().min(1).max(128),
    roleIds: z.array(z.string().min(1).max(128)).default([]),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .strict();

const roleSnapshotSchema = z.object({
  discordRoleId: z.string().min(1).max(128),
  nameCache: z.string().max(256).optional(),
});

const discordEventBodySchema = z.object({
  eventKey: z.string().min(1).max(512),
  eventType: z.string().min(1).max(128),
  discordGuildId: z.string().min(1).max(128),
  payloadHash: z.string().max(128).optional(),
  payload: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('member_upsert'),
      member: memberSnapshotSchema,
    }),
    z.object({
      kind: z.literal('member_remove'),
      discordUserId: z.string().min(1).max(128),
    }),
    z.object({
      kind: z.literal('roles_snapshot'),
      roles: z.array(roleSnapshotSchema),
    }),
    z.object({
      kind: z.literal('guild_unavailable'),
    }),
    z.object({
      kind: z.literal('guild_detach'),
    }),
  ]),
});

const reconcileBodySchema = z.object({
  members: z.array(memberSnapshotSchema).max(5000),
  roles: z.array(roleSnapshotSchema),
  eventKey: z.string().min(1).max(512).optional(),
});

// Actor is derived from the authenticated assertion, never from the body. The
// `actorV2UserId` / `actorDiscordUserId` fields are honored ONLY when the guard
// is disabled (AUTHORIZATION_ENABLED=false) so local/integration tests can
// exercise the routes without key material.
const actorFallbackFields = {
  actorV2UserId: z.string().min(1).max(128).optional(),
  actorDiscordUserId: z.string().min(1).max(128).optional(),
};

const activateBodySchema = z.object({
  ...actorFallbackFields,
  correlationId: z.string().min(1).max(128).optional(),
});

const setLoginEntitlingBodySchema = z.object({
  loginEntitling: z.boolean(),
  ...actorFallbackFields,
  correlationId: z.string().min(1).max(128).optional(),
});

const grantBodySchema = z
  .object({
    effect: z.enum(['allow', 'deny']),
    permissionId: z.string().min(1).max(256).optional(),
    groupId: z.string().min(1).max(256).optional(),
    discordUserId: z.string().min(1).max(128).optional(),
    v2UserId: z.string().min(1).max(128).optional(),
    scopeType: z.enum(['organization', 'guild']),
    scopeGuildId: z.string().min(1).max(128).optional(),
    reason: z.string().max(1024).optional(),
    ...actorFallbackFields,
    correlationId: z.string().min(1).max(128).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    const hasPermission = value.permissionId !== undefined;
    const hasGroup = value.groupId !== undefined;
    if (hasPermission === hasGroup) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exactly one of permissionId or groupId is required',
      });
    }
    if (value.discordUserId === undefined && value.v2UserId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one of discordUserId or v2UserId is required',
      });
    }
  });

const blockBodySchema = z
  .object({
    discordUserId: z.string().min(1).max(128).optional(),
    v2UserId: z.string().min(1).max(128).optional(),
    scopeType: z.enum(['global', 'guild']),
    scopeGuildId: z.string().min(1).max(128).optional(),
    reason: z.string().min(1).max(1024),
    ...actorFallbackFields,
    correlationId: z.string().min(1).max(128).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discordUserId === undefined && value.v2UserId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one of discordUserId or v2UserId is required',
      });
    }
  });

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AuthorizationError('VALIDATION_FAILED', parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

function toDecisionSubject(subject: {
  readonly v2UserId?: string | undefined;
  readonly discordUserId?: string | undefined;
}): DecisionSubject {
  return {
    ...(subject.v2UserId !== undefined ? { v2UserId: subject.v2UserId } : {}),
    ...(subject.discordUserId !== undefined ? { discordUserId: subject.discordUserId } : {}),
  };
}

function toMemberSnapshots(
  members: ReadonlyArray<{
    readonly discordUserId: string;
    readonly roleIds: readonly string[];
    readonly status: 'active' | 'inactive';
  }>,
): MemberSnapshot[] {
  return members.map((member) => ({
    discordUserId: member.discordUserId,
    roleIds: [...member.roleIds],
    status: member.status,
  }));
}

function toRoleSnapshots(
  roles: ReadonlyArray<{
    readonly discordRoleId: string;
    readonly nameCache?: string | undefined;
  }>,
): RoleSnapshot[] {
  return roles.map((role) => ({
    discordRoleId: role.discordRoleId,
    ...(role.nameCache !== undefined ? { nameCache: role.nameCache } : {}),
  }));
}

function mapDiscordPayload(
  payload: z.infer<typeof discordEventBodySchema>['payload'],
): DiscordEventPayload {
  switch (payload.kind) {
    case 'member_upsert':
      return {
        kind: 'member_upsert',
        member: toMemberSnapshots([payload.member])[0]!,
      };
    case 'member_remove':
      return { kind: 'member_remove', discordUserId: payload.discordUserId };
    case 'roles_snapshot':
      return { kind: 'roles_snapshot', roles: toRoleSnapshots(payload.roles) };
    case 'guild_unavailable':
      return { kind: 'guild_unavailable' };
    case 'guild_detach':
      return { kind: 'guild_detach' };
    default: {
      const _exhaustive: never = payload;
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        `Unsupported event payload: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

@Controller('authorization/v1')
@UseFilters(AuthorizationExceptionFilter)
@UseGuards(InboundAssertionGuard)
export class AuthorizationController {
  public constructor(
    @Inject(AUTHORIZATION_STORE_PORT) private readonly store: AuthorizationStorePort,
    @Inject(SESSION_REVOKE_PORT) private readonly revoke: SessionRevokePort | null,
    @Inject(AUTHORIZATION_CONFIG) private readonly config: AuthorizationEnv,
  ) {}

  /**
   * Resolve the acting operator. When the guard is enabled the actor MUST come
   * from the verified assertion's actor claims. Body-provided actor fields are a
   * test-only fallback honored solely when authorization is disabled.
   */
  private resolveActor(
    request: AuthenticatedRequest,
    fallback: {
      readonly actorV2UserId?: string | undefined;
      readonly actorDiscordUserId?: string | undefined;
    },
  ): DecisionSubject {
    const verified = request.verifiedActor;
    if (
      verified !== undefined &&
      (verified.v2UserId !== undefined || verified.discordUserId !== undefined)
    ) {
      return verified;
    }
    if (!this.config.AUTHORIZATION_ENABLED) {
      return {
        ...(fallback.actorV2UserId !== undefined ? { v2UserId: fallback.actorV2UserId } : {}),
        ...(fallback.actorDiscordUserId !== undefined
          ? { discordUserId: fallback.actorDiscordUserId }
          : {}),
      };
    }
    // Enabled but no actor claim present: return an empty subject so the store's
    // actor authorization rejects the mutation with FORBIDDEN.
    return {};
  }

  /** Authenticated client id (from the verified assertion) for audit rows. */
  private clientId(request: AuthenticatedRequest): { actorClientId?: string } {
    return request.verifiedClientId !== undefined
      ? { actorClientId: request.verifiedClientId }
      : {};
  }

  @Post('bootstrap/owner')
  @HttpCode(200)
  @RequireOperation('bootstrap')
  public async bootstrapOwner(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(bootstrapBodySchema, body);
    // The required owner Discord id is a server-side env seed — never taken from
    // the request body, so an untrusted caller cannot become owner.
    return useCases.bootstrapOwner(this.store, {
      discordUserId: parsed.discordUserId,
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      ...(parsed.actor !== undefined ? { actor: parsed.actor } : {}),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
      ...this.clientId(request),
      ...(this.config.AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID !== undefined
        ? { requiredBootstrapDiscordUserId: this.config.AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID }
        : {}),
    });
  }

  @Post('identity-links')
  @HttpCode(200)
  @RequireOperation('identity_link')
  public async identityLinks(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(identityLinkBodySchema, body);
    return useCases.upsertIdentityLink(this.store, { ...parsed, ...this.clientId(request) });
  }

  @Post('authorize')
  @HttpCode(200)
  @RequireOperation('authorize')
  public async authorize(@Body() body: unknown) {
    const parsed = parseOrThrow(authorizeBodySchema, body);
    const explanation = await useCases.authorize(this.store, {
      subject: toDecisionSubject(parsed.subject),
      permissionId: parsed.permissionId,
      scope: {
        type: parsed.scope.type,
        ...(parsed.scope.guildId !== undefined ? { guildId: parsed.scope.guildId } : {}),
      },
      operationClass: parsed.operationClass,
    });
    return {
      decision: explanation.decision,
      permissionId: explanation.permissionId,
      scope: explanation.scope,
      ...(explanation.winningRuleId !== undefined
        ? { winningRuleId: explanation.winningRuleId }
        : {}),
      reason: explanation.reason,
    };
  }

  @Post('authorize/explain')
  @HttpCode(200)
  @RequireOperation('authorize')
  public async authorizeExplain(@Body() body: unknown) {
    const parsed = parseOrThrow(authorizeBodySchema, body);
    return useCases.explainAuthorization(this.store, {
      subject: toDecisionSubject(parsed.subject),
      permissionId: parsed.permissionId,
      scope: {
        type: parsed.scope.type,
        ...(parsed.scope.guildId !== undefined ? { guildId: parsed.scope.guildId } : {}),
      },
      operationClass: parsed.operationClass,
    });
  }

  @Post('discord/guilds/register')
  @HttpCode(200)
  @RequireOperation('discord_register')
  public async registerGuild(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(registerGuildBodySchema, body);
    return useCases.registerGuild(this.store, {
      discordGuildId: parsed.discordGuildId,
      ...this.clientId(request),
    });
  }

  @Post('discord/events')
  @HttpCode(200)
  @RequireOperation('discord_events')
  public async applyDiscordEvent(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(discordEventBodySchema, body);
    return useCases.applyDiscordEvent(this.store, this.revoke, {
      eventKey: parsed.eventKey,
      eventType: parsed.eventType,
      discordGuildId: parsed.discordGuildId,
      payload: mapDiscordPayload(parsed.payload),
      ...(parsed.payloadHash !== undefined ? { payloadHash: parsed.payloadHash } : {}),
      ...this.clientId(request),
    });
  }

  @Post('discord/guilds/:guildId/reconcile')
  @HttpCode(200)
  @RequireOperation('discord_reconcile')
  public async reconcileGuild(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedGuild = z.string().min(1).max(128).safeParse(guildId);
    if (!parsedGuild.success) {
      throw new AuthorizationError('VALIDATION_FAILED', 'Invalid guildId');
    }
    const parsed = parseOrThrow(reconcileBodySchema, body);
    return useCases.reconcileGuild(this.store, this.revoke, {
      discordGuildId: parsedGuild.data,
      members: toMemberSnapshots(parsed.members),
      roles: toRoleSnapshots(parsed.roles),
      ...(parsed.eventKey !== undefined ? { eventKey: parsed.eventKey } : {}),
      ...this.clientId(request),
    });
  }

  @Post('discord/guilds/:guildId/activate')
  @HttpCode(200)
  @RequireOperation('activate_guild')
  public async activateGuild(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedGuild = z.string().min(1).max(128).safeParse(guildId);
    if (!parsedGuild.success) {
      throw new AuthorizationError('VALIDATION_FAILED', 'Invalid guildId');
    }
    const parsed = parseOrThrow(activateBodySchema, body);
    const result = await useCases.activateGuild(this.store, this.revoke, {
      discordGuildId: parsedGuild.data,
      actor: this.resolveActor(request, parsed),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
      ...this.clientId(request),
    });
    return {
      guild: result.guild,
      revokedUserIds: result.revokedUserIds,
    };
  }

  @Post('discord/guilds/:guildId/login-entitling')
  @HttpCode(200)
  @RequireOperation('set_login_entitling')
  public async setGuildLoginEntitling(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedGuild = z.string().min(1).max(128).safeParse(guildId);
    if (!parsedGuild.success) {
      throw new AuthorizationError('VALIDATION_FAILED', 'Invalid guildId');
    }
    const parsed = parseOrThrow(setLoginEntitlingBodySchema, body);
    const result = await useCases.setGuildLoginEntitling(this.store, this.revoke, {
      discordGuildId: parsedGuild.data,
      loginEntitling: parsed.loginEntitling,
      actor: this.resolveActor(request, parsed),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
      ...this.clientId(request),
    });
    return {
      guild: result.guild,
      revokedUserIds: result.revokedUserIds,
    };
  }

  @Post('grants')
  @HttpCode(201)
  @RequireOperation('grants')
  public async createGrant(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(grantBodySchema, body);
    return useCases.createGrant(this.store, this.revoke, {
      effect: parsed.effect,
      ...(parsed.permissionId !== undefined ? { permissionId: parsed.permissionId } : {}),
      ...(parsed.groupId !== undefined ? { groupId: parsed.groupId } : {}),
      ...(parsed.discordUserId !== undefined ? { discordUserId: parsed.discordUserId } : {}),
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      scopeType: parsed.scopeType,
      ...(parsed.scopeGuildId !== undefined ? { scopeGuildId: parsed.scopeGuildId } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      actor: this.resolveActor(request, parsed),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
      ...this.clientId(request),
    });
  }

  @Post('blocks')
  @HttpCode(201)
  @RequireOperation('blocks')
  public async createBlock(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(blockBodySchema, body);
    return useCases.createBlock(this.store, this.revoke, {
      ...(parsed.discordUserId !== undefined ? { discordUserId: parsed.discordUserId } : {}),
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      scopeType: parsed.scopeType,
      ...(parsed.scopeGuildId !== undefined ? { scopeGuildId: parsed.scopeGuildId } : {}),
      reason: parsed.reason,
      actor: this.resolveActor(request, parsed),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
      ...this.clientId(request),
    });
  }

  @Post('maintenance/expirations')
  @HttpCode(200)
  @RequireOperation('process_expirations')
  public async processExpirations(@Body() body: unknown) {
    const parsed = parseOrThrow(
      z
        .object({
          now: z.string().datetime().optional(),
        })
        .default({}),
      body ?? {},
    );
    return useCases.processExpiredPolicies(
      this.store,
      this.revoke,
      parsed.now !== undefined ? new Date(parsed.now) : undefined,
    );
  }
}
