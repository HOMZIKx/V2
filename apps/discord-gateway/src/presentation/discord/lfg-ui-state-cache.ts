import type { PartyRoleKey } from '@v2/hub-core';

export type LfgTimePreset = 'now' | 'plus2h' | 'evening' | 'custom';

export type LfgCustomWindow = {
  readonly windowStartAt: string;
  readonly windowEndAt: string;
  readonly label: string;
};

export type LfgPendingJoinRolePick = {
  readonly matchOpaqueId: string;
  readonly eligibleRoles: readonly PartyRoleKey[];
};

export type LfgPendingQuickAdd = {
  readonly classSpecKey: string;
  readonly partyRoles: readonly PartyRoleKey[];
};

export type LfgMatchCard = {
  readonly activityId: string;
  readonly opaqueId: string;
  readonly dungeonLabel: string;
  readonly startAtLabel: string;
  readonly occupancyLabel: string;
  readonly roleNeedSummary: string;
  readonly matchReason: string;
  readonly fingerprint?: string;
  readonly eligiblePartyRoles?: readonly PartyRoleKey[];
  readonly suggestedPartyRole?: PartyRoleKey;
  readonly isFull?: boolean;
};

export type LfgWizardScreen =
  | 'wizard'
  | 'edit_dungeon'
  | 'edit_character'
  | 'add_character'
  | 'edit_roles'
  | 'edit_time'
  | 'my_searches'
  | 'confirm_create'
  | 'match_view';

export type LfgWizardState = {
  readonly screen: LfgWizardScreen;
  readonly dungeonKey: string | null;
  readonly characterId: string | null;
  readonly characterLabel: string | null;
  readonly classSpecKey: string | null;
  readonly classSpecLabel: string | null;
  readonly characterSupportedRoles: readonly PartyRoleKey[];
  readonly sessionRoles: readonly PartyRoleKey[];
  readonly timePreset: LfgTimePreset | null;
  readonly customWindow: LfgCustomWindow | null;
  readonly showAllMatches: boolean;
  readonly matches: readonly LfgMatchCard[];
  readonly similarGroupsWarning: string | null;
  readonly viewedMatchOpaqueId: string | null;
  readonly pendingJoinRolePick: LfgPendingJoinRolePick | null;
  readonly pendingQuickAdd: LfgPendingQuickAdd | null;
  readonly editingWatchId: string | null;
};

export type LfgUiStateCacheKey = {
  readonly guildId: string;
  readonly discordUserId: string;
  readonly opaquePanelId: string;
};

type CacheEntry = {
  readonly state: LfgWizardState;
  readonly expiresAt: number;
};

export const LFG_UI_STATE_CACHE_TTL_MS = 20 * 60 * 1000;
export const LFG_UI_STATE_CACHE_MAX_ENTRIES = 512;

export function createDefaultLfgWizardState(): LfgWizardState {
  return {
    screen: 'wizard',
    dungeonKey: null,
    characterId: null,
    characterLabel: null,
    classSpecKey: null,
    classSpecLabel: null,
    characterSupportedRoles: [],
    sessionRoles: [],
    timePreset: null,
    customWindow: null,
    showAllMatches: false,
    matches: [],
    similarGroupsWarning: null,
    viewedMatchOpaqueId: null,
    pendingJoinRolePick: null,
    pendingQuickAdd: null,
    editingWatchId: null,
  };
}

export class LfgUiStateCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  public constructor(options?: { ttlMs?: number; maxEntries?: number; now?: () => number }) {
    this.ttlMs = options?.ttlMs ?? LFG_UI_STATE_CACHE_TTL_MS;
    this.maxEntries = options?.maxEntries ?? LFG_UI_STATE_CACHE_MAX_ENTRIES;
    this.now = options?.now ?? Date.now;
  }

  public get(key: LfgUiStateCacheKey): LfgWizardState | null {
    this.purgeExpired();
    const encoded = encodeKey(key);
    const entry = this.entries.get(encoded);
    if (entry === undefined || entry.expiresAt <= this.now()) {
      this.entries.delete(encoded);
      return null;
    }
    return cloneState(entry.state);
  }

  public set(key: LfgUiStateCacheKey, state: LfgWizardState): void {
    this.purgeExpired();
    const encoded = encodeKey(key);
    if (this.entries.has(encoded)) {
      this.entries.delete(encoded);
    } else {
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        this.entries.delete(oldest);
      }
    }
    this.entries.set(encoded, {
      state: cloneState(state),
      expiresAt: this.now() + this.ttlMs,
    });
  }

  public delete(key: LfgUiStateCacheKey): void {
    this.entries.delete(encodeKey(key));
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

function encodeKey(key: LfgUiStateCacheKey): string {
  return `${key.guildId}\u001f${key.discordUserId}\u001f${key.opaquePanelId}`;
}

function cloneState(state: LfgWizardState): LfgWizardState {
  return {
    ...state,
    characterSupportedRoles: [...state.characterSupportedRoles],
    sessionRoles: [...state.sessionRoles],
    matches: state.matches.map((match) => ({ ...match })),
    ...(state.customWindow !== null ? { customWindow: { ...state.customWindow } } : {}),
    ...(state.pendingJoinRolePick !== null
      ? {
          pendingJoinRolePick: {
            ...state.pendingJoinRolePick,
            eligibleRoles: [...state.pendingJoinRolePick.eligibleRoles],
          },
        }
      : {}),
    ...(state.pendingQuickAdd !== null
      ? {
          pendingQuickAdd: {
            ...state.pendingQuickAdd,
            partyRoles: [...state.pendingQuickAdd.partyRoles],
          },
        }
      : {}),
  };
}
