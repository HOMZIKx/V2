export interface WebGuildOption {
  readonly id: string;
  readonly name: string;
}

export const SELECTED_GUILD_STORAGE_KEY = 'v2.web.selectedGuildId';

function parseGuildsJson(raw: string | undefined): WebGuildOption[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const guilds: WebGuildOption[] = [];
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'name' in item &&
        typeof (item as { id: unknown }).id === 'string' &&
        typeof (item as { name: unknown }).name === 'string' &&
        (item as { id: string }).id.trim() !== ''
      ) {
        guilds.push({
          id: (item as { id: string }).id.trim(),
          name: (item as { name: string }).name.trim() || (item as { id: string }).id.trim(),
        });
      }
    }
    return guilds;
  } catch {
    return [];
  }
}

/** Resolve configured guilds from env (JSON array or single test guild id). */
export function readConfiguredGuilds(): WebGuildOption[] {
  const fromJson = parseGuildsJson(process.env.NEXT_PUBLIC_WEB_GUILDS);
  if (fromJson.length > 0) {
    return fromJson;
  }
  const single = process.env.NEXT_PUBLIC_DISCORD_TEST_GUILD_ID?.trim();
  if (single !== undefined && single !== '') {
    return [{ id: single, name: 'Serwer testowy' }];
  }
  return [];
}

export function readStoredGuildId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = sessionStorage.getItem(SELECTED_GUILD_STORAGE_KEY);
    return value !== null && value.trim() !== '' ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredGuildId(guildId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(SELECTED_GUILD_STORAGE_KEY, guildId);
  } catch {
    // ignore quota / private mode
  }
}

export function resolveInitialGuildId(guilds: readonly WebGuildOption[]): string | null {
  if (guilds.length === 0) {
    return null;
  }
  const stored = readStoredGuildId();
  if (stored !== null && guilds.some((guild) => guild.id === stored)) {
    return stored;
  }
  return guilds[0]?.id ?? null;
}
