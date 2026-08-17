import type { AdminGuildOption, AdminSession } from '../auth/session.js';

export type GuildLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string; readonly detail: string | null }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly devFallbackActive?: boolean };

export type GuildRemoteResult =
  | { readonly kind: 'ok'; readonly guilds: readonly AdminGuildOption[] }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code?: string;
    };

/** Owner-facing guild list errors — no env var names in copy. */
export function resolveGuildListUserMessage(error: {
  readonly message: string;
  readonly detail: string | null;
  readonly code?: string;
}): string {
  const code = error.code ?? '';
  const detail = error.detail ?? '';
  const combined = `${code} ${detail} ${error.message}`.toLowerCase();
  if (code === 'CONFIG_INVALID' || combined.includes('discord guild metadata')) {
    return 'Nie udało się pobrać serwerów z Discorda.';
  }
  if (code === 'UNAUTHENTICATED' || combined.includes('http 401')) {
    return 'Nie udało się potwierdzić sesji.';
  }
  if (
    code === 'CONNECTION_REFUSED' ||
    code === 'SERVICE_NOT_RUNNING' ||
    code === 'CORS' ||
    combined.includes('nie udało się połączyć z usługą centrum aktywności')
  ) {
    return 'Nie udało się połączyć z usługą Centrum Aktywności.';
  }
  return 'Nie udało się pobrać listy serwerów.';
}

export type GuildInventoryDecision = {
  readonly guilds: readonly AdminGuildOption[];
  readonly selectedGuildId: string | null;
  readonly loadState: Exclude<GuildLoadState, { kind: 'loading' }>;
  readonly devFallbackActive: boolean;
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
      loadState:
        guilds.length === 0 ? { kind: 'empty' } : { kind: 'ready', devFallbackActive: false },
      devFallbackActive: false,
    };
  }

  const userMessage = resolveGuildListUserMessage(input.remote);
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
      devFallbackActive: true,
    };
  }

  return {
    guilds: [],
    selectedGuildId: null,
    loadState: {
      kind: 'error',
      message: userMessage,
      detail: input.remote.detail ?? input.remote.message,
    },
    devFallbackActive: false,
  };
}

export function initialDevGuilds(session: AdminSession): readonly AdminGuildOption[] {
  return session.mode === 'dev-actor' ? session.guilds : [];
}
