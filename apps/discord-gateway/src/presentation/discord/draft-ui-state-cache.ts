/**
 * In-memory presentation cache for draft form UI state.
 * Not a source of truth — activity-service remains the draft owner.
 * No secrets, no authorization decisions, no persistence.
 */
import type { DraftFormUiState } from './activity-draft-ui-state.js';

export type DraftUiStateCacheKey = {
  readonly guildId: string;
  readonly discordUserId: string;
  readonly opaqueDraftId: string;
};

export const DRAFT_UI_STATE_CACHE_TTL_MS = 20 * 60 * 1000;
export const DRAFT_UI_STATE_CACHE_MAX_ENTRIES = 512;

type CacheEntry = {
  readonly state: DraftFormUiState;
  readonly expiresAt: number;
};

export class DraftUiStateCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  public constructor(options?: { ttlMs?: number; maxEntries?: number; now?: () => number }) {
    this.ttlMs = options?.ttlMs ?? DRAFT_UI_STATE_CACHE_TTL_MS;
    this.maxEntries = options?.maxEntries ?? DRAFT_UI_STATE_CACHE_MAX_ENTRIES;
    this.now = options?.now ?? Date.now;
  }

  public get(key: DraftUiStateCacheKey): DraftFormUiState | null {
    this.purgeExpired();
    const encoded = encodeKey(key);
    const entry = this.entries.get(encoded);
    if (entry === undefined || entry.expiresAt <= this.now()) {
      this.entries.delete(encoded);
      return null;
    }
    return cloneState(entry.state);
  }

  public set(key: DraftUiStateCacheKey, state: DraftFormUiState): void {
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

  public size(): number {
    this.purgeExpired();
    return this.entries.size;
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

function encodeKey(key: DraftUiStateCacheKey): string {
  return `${key.guildId}\u001f${key.discordUserId}\u001f${key.opaqueDraftId}`;
}

function cloneState(state: DraftFormUiState): DraftFormUiState {
  return {
    name: state.name,
    description: state.description,
    scheduleFromDisplay: state.scheduleFromDisplay,
    scheduleToDisplay: state.scheduleToDisplay,
    whenKind: state.whenKind,
    source: state.source,
  };
}
