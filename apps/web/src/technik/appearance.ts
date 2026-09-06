/**
 * Shared post appearance drafts (Technika · Wygląd).
 * localStorage is a draft cache; Centrum publish goes via postPanelPublish.
 * Zero auto-publish from this module.
 */

export type CustomButtonStyle = 'primary' | 'secondary' | 'danger';

/** New Bot publish action kinds for customButtons[].action */
export type CustomButtonAction =
  | 'create'
  | 'lfg'
  | 'mine'
  | 'notify'
  | 'profile'
  | 'forme'
  | 'url'
  | 'ephemeral_text';

export type AppearanceCustomButton = {
  id: string;
  label: string;
  style: CustomButtonStyle;
  action: CustomButtonAction;
  /** Required when action === 'url' */
  url?: string;
  /** Required when action === 'ephemeral_text' */
  ephemeralText?: string;
};

export type AppearanceDraft = {
  panelTitle: string;
  panelDescription: string;
  accentHex: string;
  includeBanner: boolean;
  bannerUrl: string;
  customButtons: AppearanceCustomButton[];
};

export const APPEARANCE_STORAGE_KEY = 'technik.appearance.v1';

export const CUSTOM_BUTTON_ACTIONS: readonly {
  readonly id: CustomButtonAction;
  readonly label: string;
}[] = [
  { id: 'create', label: 'Hub: Utwórz aktywność' },
  { id: 'lfg', label: 'Hub: Szukam ekipy' },
  { id: 'mine', label: 'Hub: Moje aktywności' },
  { id: 'notify', label: 'Hub: Powiadomienia' },
  { id: 'profile', label: 'Hub: Profil' },
  { id: 'forme', label: 'Hub: Dla mnie' },
  { id: 'url', label: 'Link URL' },
  { id: 'ephemeral_text', label: 'Ephemeral text' },
] as const;

export const CUSTOM_BUTTON_STYLES: readonly {
  readonly id: CustomButtonStyle;
  readonly label: string;
}[] = [
  { id: 'primary', label: 'Primary' },
  { id: 'secondary', label: 'Secondary' },
  { id: 'danger', label: 'Danger' },
] as const;

export const DEFAULT_APPEARANCE: AppearanceDraft = {
  panelTitle: 'Centrum aktywności',
  panelDescription:
    'Utwórz aktywność, znajdź ekipę albo sprawdź powiadomienia — wszystko w jednym panelu.',
  accentHex: '#5865F2',
  includeBanner: true,
  bannerUrl: '',
  customButtons: [],
};

function newButtonId(): string {
  return 'btn_' + Math.random().toString(36).slice(2, 10);
}

export function createEmptyCustomButton(): AppearanceCustomButton {
  return {
    id: newButtonId(),
    label: 'Nowy przycisk',
    style: 'secondary',
    action: 'ephemeral_text',
    ephemeralText: 'Wkrótce…',
  };
}

function normalizeButton(raw: unknown): AppearanceCustomButton | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const action = typeof p.action === 'string' ? p.action : '';
  const allowed: CustomButtonAction[] = [
    'create',
    'lfg',
    'mine',
    'notify',
    'profile',
    'forme',
    'url',
    'ephemeral_text',
  ];
  if (!allowed.includes(action as CustomButtonAction)) return null;
  const styleRaw = typeof p.style === 'string' ? p.style : 'secondary';
  const style: CustomButtonStyle =
    styleRaw === 'primary' || styleRaw === 'danger' ? styleRaw : 'secondary';
  const btn: AppearanceCustomButton = {
    id: typeof p.id === 'string' && p.id.trim() ? p.id : newButtonId(),
    label: typeof p.label === 'string' ? p.label : 'Przycisk',
    style,
    action: action as CustomButtonAction,
  };
  if (btn.action === 'url' && typeof p.url === 'string') btn.url = p.url;
  if (btn.action === 'ephemeral_text' && typeof p.ephemeralText === 'string') {
    btn.ephemeralText = p.ephemeralText;
  }
  return btn;
}

export function loadAppearance(): AppearanceDraft {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE, customButtons: [] };
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE, customButtons: [] };
    const p = JSON.parse(raw) as Partial<AppearanceDraft> & Record<string, unknown>;
    const buttons = Array.isArray(p.customButtons)
      ? p.customButtons.map(normalizeButton).filter((b): b is AppearanceCustomButton => Boolean(b))
      : [];
    return {
      panelTitle: typeof p.panelTitle === 'string' ? p.panelTitle : DEFAULT_APPEARANCE.panelTitle,
      panelDescription:
        typeof p.panelDescription === 'string'
          ? p.panelDescription
          : DEFAULT_APPEARANCE.panelDescription,
      accentHex: typeof p.accentHex === 'string' ? p.accentHex : DEFAULT_APPEARANCE.accentHex,
      includeBanner:
        typeof p.includeBanner === 'boolean' ? p.includeBanner : DEFAULT_APPEARANCE.includeBanner,
      bannerUrl: typeof p.bannerUrl === 'string' ? p.bannerUrl : DEFAULT_APPEARANCE.bannerUrl,
      customButtons: buttons,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE, customButtons: [] };
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

/** Strip empty extras; ready for New Bot publish body. */
export function serializeCustomButtons(
  buttons: readonly AppearanceCustomButton[],
): readonly Record<string, string>[] {
  return buttons.map((b) => {
    const out: Record<string, string> = {
      id: b.id,
      label: b.label.trim() || 'Przycisk',
      style: b.style,
      action: b.action,
    };
    if (b.action === 'url' && b.url?.trim()) out.url = b.url.trim();
    if (b.action === 'ephemeral_text' && b.ephemeralText?.trim()) {
      out.ephemeralText = b.ephemeralText.trim();
    }
    return out;
  });
}

/** Normalize accent to Discord integer color when possible. */
export function accentHexToInt(hex: string): number | undefined {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return undefined;
  return Number.parseInt(m[1]!, 16);
}
