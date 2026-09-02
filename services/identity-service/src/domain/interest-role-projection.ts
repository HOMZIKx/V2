/**
 * Interest → Discord role projection safety (Hub Core foundation).
 * ROLE_PROJECTION_POLICY: safety + desired-state compute implemented.
 * ROLE_PROJECTION_DISCORD_MUTATION: pending Owner decision — no apply loop wired.
 * Interest role is informational; never treat as permission unless separately configured.
 */

export type InterestRoleMappingInput = {
  readonly guildId: string;
  readonly interestKey: string;
  readonly discordRoleId: string;
  readonly enabled?: boolean;
};

export type DiscordRoleSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly position: number;
  readonly permissionsBitfield: bigint;
};

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;
const MANAGE_ROLES = 1n << 28n;

export type RoleProjectionSafetyResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function validateInterestRoleMappingSafety(input: {
  readonly role: DiscordRoleSnapshot;
  readonly botHighestPosition: number;
  readonly everyoneRoleId: string;
}): RoleProjectionSafetyResult {
  if (input.role.id === input.everyoneRoleId) {
    return { ok: false, reason: 'Cannot map interest to @everyone' };
  }
  if (input.role.managed) {
    return { ok: false, reason: 'Cannot map interest to a managed/integration role' };
  }
  if ((input.role.permissionsBitfield & ADMINISTRATOR) === ADMINISTRATOR) {
    return { ok: false, reason: 'Cannot map interest to a role with Administrator' };
  }
  if ((input.role.permissionsBitfield & MANAGE_GUILD) === MANAGE_GUILD) {
    return { ok: false, reason: 'Cannot map interest to a role with Manage Guild' };
  }
  if ((input.role.permissionsBitfield & MANAGE_ROLES) === MANAGE_ROLES) {
    return { ok: false, reason: 'Cannot map interest to a role with Manage Roles' };
  }
  if (input.role.position >= input.botHighestPosition) {
    return {
      ok: false,
      reason: 'Role is at or above bot role hierarchy — assignment would fail',
    };
  }
  return { ok: true };
}

export type DesiredRoleProjection = {
  readonly discordRoleId: string;
  readonly interestKey: string;
  readonly action: 'assign' | 'remove';
};

/**
 * Idempotent desired-state compute: assign mapped roles for held interests;
 * remove mapped roles for interests the user no longer holds (guild-scoped).
 */
export function computeInterestRoleProjection(input: {
  readonly userInterestKeys: readonly string[];
  readonly mappings: readonly {
    readonly interestKey: string;
    readonly discordRoleId: string;
    readonly enabled: boolean;
  }[];
  readonly currentlyHeldRoleIds: ReadonlySet<string>;
}): readonly DesiredRoleProjection[] {
  const enabled = input.mappings.filter((m) => m.enabled);
  const desiredRoleIds = new Set<string>();
  const desiredByRole = new Map<string, string>();
  for (const mapping of enabled) {
    if (input.userInterestKeys.includes(mapping.interestKey)) {
      desiredRoleIds.add(mapping.discordRoleId);
      desiredByRole.set(mapping.discordRoleId, mapping.interestKey);
    }
  }

  const mappedRoleIds = new Set(enabled.map((m) => m.discordRoleId));
  const actions: DesiredRoleProjection[] = [];

  for (const roleId of desiredRoleIds) {
    if (!input.currentlyHeldRoleIds.has(roleId)) {
      actions.push({
        discordRoleId: roleId,
        interestKey: desiredByRole.get(roleId) ?? 'unknown',
        action: 'assign',
      });
    }
  }

  for (const roleId of mappedRoleIds) {
    if (input.currentlyHeldRoleIds.has(roleId) && !desiredRoleIds.has(roleId)) {
      const mapping = enabled.find((m) => m.discordRoleId === roleId);
      actions.push({
        discordRoleId: roleId,
        interestKey: mapping?.interestKey ?? 'unknown',
        action: 'remove',
      });
    }
  }

  return actions;
}
