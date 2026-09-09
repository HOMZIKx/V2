type JsonRecord = Record<string, unknown>;

export type VerifiedNotifyViewer = {
  readonly discordId: string;
  readonly appId?: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function discordSnowflake(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{17,20}$/.test(trimmed) ? trimmed : null;
}

function plainId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the server-authoritative Discord DM audience from the shared workspace.
 * The caller cannot inject arbitrary Discord ids: an optional viewer identity must
 * already be server-verified and is only used to backfill that viewer's own member row.
 * Member notify override still wins over the team default.
 */
export function authoritativeNotifyRecipients(
  workspace: JsonRecord,
  key: 'characterTimers' | 'kingdomWar',
  viewer?: VerifiedNotifyViewer,
): string[] {
  const teamPrefs = asRecord(workspace.notifyPrefs);
  const teamDefault = typeof teamPrefs?.[key] === 'boolean' ? Boolean(teamPrefs[key]) : true;
  const members = Array.isArray(workspace.members) ? workspace.members : [];
  const ids = new Set<string>();
  const verifiedViewerDiscordId = discordSnowflake(viewer?.discordId);
  const verifiedViewerAppId = plainId(viewer?.appId);

  for (const raw of members) {
    const member = asRecord(raw);
    if (!member) continue;
    const personal = asRecord(member.notifyPrefs);
    const enabled = typeof personal?.[key] === 'boolean' ? Boolean(personal[key]) : teamDefault;
    if (!enabled) continue;

    const directId = discordSnowflake(member.discordAccountId) ?? discordSnowflake(member.id);
    if (directId) {
      ids.add(directId);
      continue;
    }

    // Older workspaces may still hold only the V2 app UUID on the member row even
    // though the authenticated session already knows the Discord snowflake.
    const memberAppId = plainId(member.id);
    if (
      verifiedViewerDiscordId &&
      verifiedViewerAppId &&
      memberAppId === verifiedViewerAppId
    ) {
      ids.add(verifiedViewerDiscordId);
    }
  }

  return [...ids].slice(0, 40);
}
