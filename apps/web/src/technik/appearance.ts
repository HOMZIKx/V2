/**
 * Shared Centrum panel appearance draft (Technika).
 * localStorage is a draft cache; real publish goes via postPanelPublish.
 */

export type AppearanceDraft = {
  panelTitle: string;
  panelDescription: string;
  accentHex: string;
  includeBanner: boolean;
};

export const APPEARANCE_STORAGE_KEY = 'technik.appearance.v1';

export const DEFAULT_APPEARANCE: AppearanceDraft = {
  panelTitle: 'Centrum aktywności',
  panelDescription:
    'Utwórz aktywność, znajdź ekipę albo sprawdź powiadomienia — wszystko w jednym panelu.',
  accentHex: '#5865F2',
  includeBanner: true,
};

export function loadAppearance(): AppearanceDraft {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const p = JSON.parse(raw) as Partial<AppearanceDraft>;
    return {
      panelTitle: typeof p.panelTitle === 'string' ? p.panelTitle : DEFAULT_APPEARANCE.panelTitle,
      panelDescription:
        typeof p.panelDescription === 'string'
          ? p.panelDescription
          : DEFAULT_APPEARANCE.panelDescription,
      accentHex: typeof p.accentHex === 'string' ? p.accentHex : DEFAULT_APPEARANCE.accentHex,
      includeBanner:
        typeof p.includeBanner === 'boolean' ? p.includeBanner : DEFAULT_APPEARANCE.includeBanner,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function persistAppearance(next: AppearanceDraft): void {
  if (typeof window === 'undefined') return;
  let leftovers: Record<string, unknown> = {};
  try {
    const prevRaw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    leftovers = prevRaw ? (JSON.parse(prevRaw) as Record<string, unknown>) : {};
  } catch {
    leftovers = {};
  }
  if ('enabledModules' in leftovers) delete leftovers.enabledModules;
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ ...leftovers, ...next }));
}

/** Normalize accent to Discord integer color when possible. */
export function accentHexToInt(hex: string): number | undefined {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return undefined;
  return Number.parseInt(m[1], 16);
}
