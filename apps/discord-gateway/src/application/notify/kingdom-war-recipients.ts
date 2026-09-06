/**
 * In-memory registry of Discord user IDs eligible for kingdom-war DMs.
 * Populated by web from team notifyPrefs.kingdomWar (default true).
 * HARD RULE: war scheduler DMs ONLY this list — never guild.members / never whole guild.
 */
const MAX_RECIPIENTS = 40;

const recipients = new Set<string>();

function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

export function replaceKingdomWarRecipients(discordUserIds: readonly string[]): {
  readonly ok: true;
  readonly count: number;
} {
  recipients.clear();
  for (const raw of discordUserIds) {
    const id = raw.trim();
    if (!isSnowflake(id)) continue;
    recipients.add(id);
    if (recipients.size >= MAX_RECIPIENTS) break;
  }
  return { ok: true, count: recipients.size };
}

export function listKingdomWarRecipients(): readonly string[] {
  return [...recipients];
}

/** Test helper */
export function clearKingdomWarRecipientsForTests(): void {
  recipients.clear();
}
