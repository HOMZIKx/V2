import type { AdminGuildOption, AdminSession } from '../auth/session.js';

export type GuildLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string; readonly detail: string | null }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready' };

export type GuildRemoteResult =
  | { readonly kind: 'ok'; readonly guilds: readonly AdminGuildOption[] }
  | { readonly kind: 'error'; readonly message: string; readonly detail: string | null };

export type GuildInventoryDecision = {
  readonly guilds: readonly AdminGuildOption[];
  readonly selectedGuildId: string | null;
  readonly loadState: Exclude<GuildLoadState, { kind: 'loading' }>;
};

function pickSelected(
  currentGuildId: string | null,
  guilds: readonly AdminGuildOption[],
): string | null {
  if (currentGuildId !== null && guilds.some((guild) => guild.id === currentGuildId)) {
    return currentGuildId;
  }
  return guilds[0]?.id ?? null;
}

/**
 * Browser UX for guild inventory. Authorization remains on the server.
 * DEV actor may keep local session guilds only when the remote list request fails.
 */
export function decideGuildInventory(input: {
  readonly mode: AdminSession['mode'];
  readonly sessionGuilds: readonly AdminGuildOption[];
  readonly currentGuildId: string | null;
  readonly remote: GuildRemoteResult;
}): GuildInventoryDecision {
  if (input.remote.kind === 'ok') {
    const guilds = input.remote.guilds;
    return {
      guilds,
      selectedGuildId: pickSelected(input.currentGuildId, guilds),
      loadState: guilds.length === 0 ? { kind: 'empty' } : { kind: 'ready' },
    };
  }

  const mayUseDevFallback = input.mode === 'dev-actor' && input.sessionGuilds.length > 0;
  if (mayUseDevFallback) {
    return {
      guilds: input.sessionGuilds,
      selectedGuildId: pickSelected(input.currentGuildId, input.sessionGuilds),
      loadState: {
        kind: 'error',
        message: 'Nie udało się odświeżyć listy serwerów. Pokazuję lokalną listę deweloperską.',
        detail: input.remote.detail ?? input.remote.message,
      },
    };
  }

  return {
    guilds: [],
    selectedGuildId: null,
    loadState: {
      kind: 'error',
      message: 'Nie udało się pobrać listy serwerów.',
      detail: input.remote.detail ?? input.remote.message,
    },
  };
}

export function initialDevGuilds(session: AdminSession): readonly AdminGuildOption[] {
  return session.mode === 'dev-actor' ? session.guilds : [];
}
