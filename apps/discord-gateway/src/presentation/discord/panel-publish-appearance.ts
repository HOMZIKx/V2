/**
 * Technika Centrum / Wyglad publish contract (matches web postPanelPublish).
 * Zero auto-publish — only explicit Technika publish/preview/refresh paths.
 */

export type PanelButtonStyle = 'primary' | 'secondary' | 'danger';

export type PanelHubActionId = 'create' | 'lfg' | 'mine' | 'notify' | 'profile' | 'forme';

export type PanelCustomButtonAction = PanelHubActionId | 'url' | 'ephemeral_text';

export type PanelCustomButton = {
  readonly id: string;
  readonly label: string;
  readonly style: PanelButtonStyle;
  readonly action: PanelCustomButtonAction;
  readonly url?: string;
  readonly ephemeralText?: string;
};

export type PanelPublishAppearance = {
  readonly title?: string;
  readonly description?: string;
  readonly accentHex?: string;
  readonly includeBanner?: boolean;
  readonly bannerUrl?: string;
  readonly enabledActions?: readonly PanelHubActionId[];
  readonly customButtons?: readonly PanelCustomButton[];
};

export const HUB_ACTION_LABELS: Record<PanelHubActionId, string> = {
  create: 'Utwórz aktywność',
  lfg: 'Szukam ekipy',
  mine: 'Moje aktywności',
  notify: 'Powiadomienia',
  profile: 'Profil',
  forme: 'Dla mnie',
};

export const DEFAULT_HUB_ACTIONS: readonly PanelHubActionId[] = ['create', 'lfg', 'mine', 'notify'];

const HUB_SET = new Set<string>(['create', 'lfg', 'mine', 'notify', 'profile', 'forme']);
const CUSTOM_ACTION_SET = new Set<string>([...HUB_SET, 'url', 'ephemeral_text']);

export function accentHexToInt(hex: string | undefined): number | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || !m[1]) return undefined;
  return Number.parseInt(m[1], 16);
}

function normalizeStyle(raw: unknown): PanelButtonStyle {
  const s = String(raw ?? 'secondary');
  if (s === 'primary' || s === 'danger') return s;
  return 'secondary';
}

function normalizeCustomButton(raw: unknown): PanelCustomButton | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const action = String(p.action ?? '');
  if (!CUSTOM_ACTION_SET.has(action)) return null;
  const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : '';
  if (!id) return null;
  const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : 'Przycisk';
  const btn: PanelCustomButton = {
    id,
    label,
    style: normalizeStyle(p.style),
    action: action as PanelCustomButtonAction,
  };
  if (btn.action === 'url' && typeof p.url === 'string' && p.url.trim()) {
    return { ...btn, url: p.url.trim() };
  }
  if (
    btn.action === 'ephemeral_text' &&
    typeof p.ephemeralText === 'string' &&
    p.ephemeralText.trim()
  ) {
    return { ...btn, ephemeralText: p.ephemeralText.trim() };
  }
  if (
    btn.action === 'ephemeral_text' &&
    typeof p.ephemeral_text === 'string' &&
    p.ephemeral_text.trim()
  ) {
    return { ...btn, ephemeralText: p.ephemeral_text.trim() };
  }
  return btn;
}

export function parsePanelPublishAppearance(
  record: Record<string, unknown>,
): PanelPublishAppearance {
  const title =
    typeof record.title === 'string' && record.title.trim() ? record.title.trim() : undefined;
  const description = typeof record.description === 'string' ? record.description : undefined;
  const accentHex =
    typeof record.accentHex === 'string' && record.accentHex.trim()
      ? record.accentHex.trim()
      : undefined;
  const includeBanner =
    typeof record.includeBanner === 'boolean' ? record.includeBanner : undefined;
  const bannerUrl =
    typeof record.bannerUrl === 'string' && record.bannerUrl.trim()
      ? record.bannerUrl.trim()
      : undefined;

  let enabledActions: PanelHubActionId[] | undefined;
  if (Array.isArray(record.enabledActions)) {
    enabledActions = record.enabledActions
      .map(String)
      .filter((id): id is PanelHubActionId => HUB_SET.has(id));
  }

  let customButtons: PanelCustomButton[] | undefined;
  if (Array.isArray(record.customButtons)) {
    customButtons = record.customButtons
      .map(normalizeCustomButton)
      .filter((b): b is PanelCustomButton => Boolean(b));
  }

  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(accentHex !== undefined ? { accentHex } : {}),
    ...(includeBanner !== undefined ? { includeBanner } : {}),
    ...(bannerUrl !== undefined ? { bannerUrl } : {}),
    ...(enabledActions !== undefined ? { enabledActions } : {}),
    ...(customButtons !== undefined ? { customButtons } : {}),
  };
}

export function hasCentrumActions(appearance: PanelPublishAppearance): boolean {
  return Array.isArray(appearance.enabledActions);
}
