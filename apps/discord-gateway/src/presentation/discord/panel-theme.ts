export const V2_PANEL_COLORS = {
  embed: 0x7c3aed,
  success: 0x22d3ee,
  warning: 0xfbbf24,
  danger: 0xf43f5e,
  neutral: 0x1f2937,
} as const;

export const PANEL_TITLE = 'V2 LAB • PANEL TESTOWY';
export const PANEL_DESCRIPTION =
  'Wybierz funkcję z menu, otwórz formularz albo odśwież ten panel. Potwierdzenia i szczegóły statusu dostaniesz prywatnie — bez spamu na kanale.';
export const PANEL_FOOTER = 'V2 LAB • użyj menu lub przycisków';
export const SELECT_PLACEHOLDER = 'Nie wybrano żadnej opcji';

export const SELECT_OPTIONS = [
  {
    value: 'system_status',
    label: 'Stan systemu',
    description: 'Prywatny status połączenia',
    emoji: '🧭',
  },
  {
    value: 'reply_test',
    label: 'Test odpowiedzi',
    description: 'Prywatne potwierdzenie z correlation ID',
    emoji: '🧪',
  },
  {
    value: 'form_test',
    label: 'Formularz testowy',
    description: 'Otwiera krótki modal testowy',
    emoji: '📝',
  },
] as const;

export type SelectOptionValue = (typeof SELECT_OPTIONS)[number]['value'];
