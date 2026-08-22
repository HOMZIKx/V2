import { apiRequest } from './http.js';

export type LfgCompositionRoleKey = 'TANK' | 'BUFF' | 'DPS' | 'FLEX';

export interface LfgCompositionRoleDto {
  readonly partyRoleKey: LfgCompositionRoleKey;
  readonly requiredCount: number;
  readonly preferred: boolean;
}

export interface LfgCompositionTemplatesDto {
  readonly organizationId: string;
  readonly activityTypeKey: string;
  readonly roles: readonly LfgCompositionRoleDto[];
}

function adminOrg(orgId: string, suffix = ''): string {
  return `/activity/v1/admin/organizations/${encodeURIComponent(orgId)}${suffix}`;
}

export async function listLfgCompositionTemplates(
  orgId: string,
  guildId: string,
  activityTypeKey: string,
): Promise<LfgCompositionTemplatesDto> {
  return apiRequest(adminOrg(orgId, '/lfg/composition-templates'), {
    query: { activityTypeKey, guildId },
  });
}

export async function upsertLfgCompositionTemplates(
  orgId: string,
  guildId: string,
  body: {
    activityTypeKey: 'azrael' | 'smok';
    roles: readonly {
      partyRoleKey: LfgCompositionRoleKey;
      requiredCount: number;
      preferred?: boolean;
    }[];
  },
): Promise<LfgCompositionTemplatesDto> {
  return apiRequest(adminOrg(orgId, '/lfg/composition-templates'), {
    method: 'PUT',
    body,
    query: { guildId },
    idempotent: true,
  });
}
