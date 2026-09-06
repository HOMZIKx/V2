/**
 * Centrum hub actions — product labels only (never show custom_id in UI).
 * Source: docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md § zaakceptowane etykiety.
 */

export type CentrumHubActionId =
  | 'create'
  | 'lfg'
  | 'mine'
  | 'inbox'
  | 'forMe'
  | 'profile';

export type CentrumHubAction = {
  readonly id: CentrumHubActionId;
  /** Player-facing Discord button label */
  readonly label: string;
  /** Short Techniker-facing description */
  readonly description: string;
  /** Core four from UX contract vs optional product extras */
  readonly core: boolean;
};

export const CENTRUM_HUB_ACTIONS: readonly CentrumHubAction[] = [
  {
    id: 'create',
    label: 'Utwórz aktywność',
    description: 'Pełny formularz one-shot: nazwa, rodzaj, termin, kanał.',
    core: true,
  },
  {
    id: 'lfg',
    label: 'Szukam ekipy',
    description: 'Szybka ścieżka tej samej aktywności (LFG).',
    core: true,
  },
  {
    id: 'mine',
    label: 'Moje aktywności',
    description: 'Prywatny widok: utworzone, zapisane, zakończone, anulowane.',
    core: true,
  },
  {
    id: 'inbox',
    label: 'Powiadomienia',
    description: 'Prywatna skrzynka powiadomień z panelu Centrum.',
    core: true,
  },
  {
    id: 'forMe',
    label: 'Dla mnie',
    description: 'Aktywności dopasowane do gracza (opcjonalny moduł produktu).',
    core: false,
  },
  {
    id: 'profile',
    label: 'Profil',
    description: 'Profil gracza w Centrum (opcjonalny moduł produktu).',
    core: false,
  },
] as const;

export const DEFAULT_ENABLED_HUB_ACTIONS: readonly CentrumHubActionId[] =
  CENTRUM_HUB_ACTIONS.filter((a) => a.core).map((a) => a.id);

const MODULES_KEY = 'technik.centrumModules.v1';
const LEGACY_APPEARANCE_KEY = 'technik.appearance.v1';

export function loadEnabledHubActions(): CentrumHubActionId[] {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: unknown };
      if (Array.isArray(parsed.enabled)) {
        const ids = new Set(CENTRUM_HUB_ACTIONS.map((a) => a.id));
        return parsed.enabled
          .map(String)
          .filter((id): id is CentrumHubActionId => ids.has(id as CentrumHubActionId));
      }
    }
    const legacy = localStorage.getItem(LEGACY_APPEARANCE_KEY);
    if (legacy) {
      const p = JSON.parse(legacy) as { enabledModules?: unknown };
      if (Array.isArray(p.enabledModules)) {
        const ids = new Set(CENTRUM_HUB_ACTIONS.map((a) => a.id));
        const migrated = p.enabledModules
          .map(String)
          .filter((id): id is CentrumHubActionId => ids.has(id as CentrumHubActionId));
        if (migrated.length) {
          saveEnabledHubActions(migrated);
          return migrated;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_ENABLED_HUB_ACTIONS];
}

export function saveEnabledHubActions(enabled: readonly CentrumHubActionId[]): void {
  localStorage.setItem(MODULES_KEY, JSON.stringify({ enabled: [...enabled] }));
}


/** Map UI hub ids → New Bot publish enabledActions (inbox→notify, forMe→forme). */
export function mapHubActionsForPublish(
  ids: readonly CentrumHubActionId[],
): readonly string[] {
  return ids.map((id) => {
    if (id === 'inbox') return 'notify';
    if (id === 'forMe') return 'forme';
    return id;
  });
}
