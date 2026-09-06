import type { NotifyPrefKey, TeamNotifyPrefs } from './player-store';

declare module './player-store' {
  /**
   * Workspace members store personal notification overrides as Partial<TeamNotifyPrefs>.
   * The runtime resolver already handles missing keys by inheriting team defaults;
   * these overloads expose that real contract to TypeScript callers using
   * exactOptionalPropertyTypes.
   */
  export function resolveEffectiveNotifyPrefs(
    workspace: { readonly notifyPrefs?: TeamNotifyPrefs | null | undefined },
    member?: { readonly notifyPrefs?: Partial<TeamNotifyPrefs> | null | undefined } | null,
  ): TeamNotifyPrefs;

  export function isNotifyPrefEnabled(
    workspace: { readonly notifyPrefs?: TeamNotifyPrefs | null | undefined },
    key: NotifyPrefKey,
    member?: { readonly notifyPrefs?: Partial<TeamNotifyPrefs> | null | undefined } | null,
  ): boolean;
}

export {};
