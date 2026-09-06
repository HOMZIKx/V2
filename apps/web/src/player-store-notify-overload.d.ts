import type { NotifyPrefKey, TeamNotifyPrefs } from './player-store';

declare module './player-store' {
  /**
   * Workspace members store personal notification overrides as Partial<TeamNotifyPrefs>.
   * The runtime resolver already handles missing keys by inheriting team defaults;
   * this overload exposes that real contract to TypeScript callers.
   */
  export function isNotifyPrefEnabled(
    workspace: { readonly notifyPrefs?: TeamNotifyPrefs | null },
    key: NotifyPrefKey,
    member?: { readonly notifyPrefs?: Partial<TeamNotifyPrefs> | null } | null,
  ): boolean;
}

export {};
