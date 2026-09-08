type JsonRecord = Record<string, unknown>;

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

/**
 * Build the server-authoritative Discord DM audience from the shared workspace.
 * The caller cannot inject arbitrary Discord ids; member override wins over team default.
 */
export function authoritativeNotifyRecipients(
  workspace: JsonRecord,
  key: 'characterTimers' | 'kingdomWar',
): string[] {
  const teamPrefs = asRecord(workspace.notifyPrefs);
  const teamDefault = typeof teamPrefs?.[key] === 'boolean' ? Boolean(teamPrefs[key]) : true;
  const members = Array.isArray(workspace.members) ? workspace.members : [];
  const ids = new Set<string>();

  for (const raw of members) {
    const member = asRecord(raw);
    if (!member) continue;
    const personal = asRecord(member.notifyPrefs);
    const enabled = typeof personal?.[key] === 'boolean' ? Boolean(personal[key]) : teamDefault;
    if (!enabled) continue;
    const id = discordSnowflake(member.discordAccountId) ?? discordSnowflake(member.id);
    if (id) ids.add(id);
  }

  return [...ids].slice(0, 40);
}
