import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
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
import { AuthorizationExceptionFilter } from './authorization-exception.filter.js';
import {
  AUTHORIZATION_STORE_PORT,
  SESSION_REVOKE_PORT,
} from './authorization.tokens.js';
import { InboundAssertionGuard } from './inbound-assertion.guard.js';

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
  loginEntitling: z.boolean().optional(),
});

const memberSnapshotSchema = z.object({
  discordUserId: z.string().min(1).max(128),
  v2UserId: z.string().min(1).max(128).optional(),
  roleIds: z.array(z.string().min(1).max(128)).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
});

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
      kind: z.literal('guild_detach'),
    }),
  ]),
});

const reconcileBodySchema = z.object({
  members: z.array(memberSnapshotSchema),
  roles: z.array(roleSnapshotSchema),
  eventKey: z.string().min(1).max(512).optional(),
});

const activateBodySchema = z.object({
  loginEntitling: z.boolean(),
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
    specificity: z.enum(['user', 'guild', 'organization', 'group_default']),
    reason: z.string().max(1024).optional(),
    createdBy: z.string().max(256).optional(),
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
    createdBy: z.string().max(256).optional(),
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
    readonly v2UserId?: string | undefined;
    readonly roleIds: readonly string[];
    readonly status: 'active' | 'inactive';
  }>,
): MemberSnapshot[] {
  return members.map((member) => ({
    discordUserId: member.discordUserId,
    roleIds: [...member.roleIds],
    status: member.status,
    ...(member.v2UserId !== undefined ? { v2UserId: member.v2UserId } : {}),
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
  ) {}

  @Post('bootstrap/owner')
  @HttpCode(200)
  public async bootstrapOwner(@Body() body: unknown) {
    const parsed = parseOrThrow(bootstrapBodySchema, body);
    return useCases.bootstrapOwner(this.store, {
      discordUserId: parsed.discordUserId,
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      ...(parsed.actor !== undefined ? { actor: parsed.actor } : {}),
      ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
    });
  }

  @Post('identity-links')
  @HttpCode(200)
  public async identityLinks(@Body() body: unknown) {
    const parsed = parseOrThrow(identityLinkBodySchema, body);
    return useCases.upsertIdentityLink(this.store, parsed);
  }

  @Post('authorize')
  @HttpCode(200)
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
  public async registerGuild(@Body() body: unknown) {
    const parsed = parseOrThrow(registerGuildBodySchema, body);
    return useCases.registerGuild(this.store, {
      discordGuildId: parsed.discordGuildId,
      ...(parsed.loginEntitling !== undefined
        ? { loginEntitling: parsed.loginEntitling }
        : {}),
    });
  }

  @Post('discord/events')
  @HttpCode(200)
  public async applyDiscordEvent(@Body() body: unknown) {
    const parsed = parseOrThrow(discordEventBodySchema, body);
    return useCases.applyDiscordEvent(this.store, this.revoke, {
      eventKey: parsed.eventKey,
      eventType: parsed.eventType,
      discordGuildId: parsed.discordGuildId,
      payload: mapDiscordPayload(parsed.payload),
      ...(parsed.payloadHash !== undefined ? { payloadHash: parsed.payloadHash } : {}),
    });
  }

  @Post('discord/guilds/:guildId/reconcile')
  @HttpCode(200)
  public async reconcileGuild(@Param('guildId') guildId: string, @Body() body: unknown) {
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
    });
  }

  @Post('discord/guilds/:guildId/activate')
  @HttpCode(200)
  public async activateGuild(@Param('guildId') guildId: string, @Body() body: unknown) {
    const parsedGuild = z.string().min(1).max(128).safeParse(guildId);
    if (!parsedGuild.success) {
      throw new AuthorizationError('VALIDATION_FAILED', 'Invalid guildId');
    }
    const parsed = parseOrThrow(activateBodySchema, body);
    const result = await useCases.activateGuild(this.store, this.revoke, {
      discordGuildId: parsedGuild.data,
      loginEntitling: parsed.loginEntitling,
    });
    return {
      guild: result.guild,
      revokedUserIds: result.revokedUserIds,
    };
  }

  @Post('grants')
  @HttpCode(201)
  public async createGrant(@Body() body: unknown) {
    const parsed = parseOrThrow(grantBodySchema, body);
    return useCases.createGrant(this.store, {
      effect: parsed.effect,
      ...(parsed.permissionId !== undefined ? { permissionId: parsed.permissionId } : {}),
      ...(parsed.groupId !== undefined ? { groupId: parsed.groupId } : {}),
      ...(parsed.discordUserId !== undefined ? { discordUserId: parsed.discordUserId } : {}),
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      scopeType: parsed.scopeType,
      ...(parsed.scopeGuildId !== undefined ? { scopeGuildId: parsed.scopeGuildId } : {}),
      specificity: parsed.specificity,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      ...(parsed.createdBy !== undefined ? { createdBy: parsed.createdBy } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
    });
  }

  @Post('blocks')
  @HttpCode(201)
  public async createBlock(@Body() body: unknown) {
    const parsed = parseOrThrow(blockBodySchema, body);
    return useCases.createBlock(this.store, {
      ...(parsed.discordUserId !== undefined ? { discordUserId: parsed.discordUserId } : {}),
      ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      scopeType: parsed.scopeType,
      ...(parsed.scopeGuildId !== undefined ? { scopeGuildId: parsed.scopeGuildId } : {}),
      reason: parsed.reason,
      ...(parsed.createdBy !== undefined ? { createdBy: parsed.createdBy } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: new Date(parsed.expiresAt) } : {}),
    });
  }
}
