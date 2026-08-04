export const V2_PANEL_COLORS = {
  embed: 0x7c3aed,
  success: 0x22d3ee,
  warning: 0xfbbf24,
  danger: 0xf43f5e,
  neutral: 0x1f2937,
} as const;

export const PANEL_TITLE = 'V2 LAB • PANEL TESTOWY';
export const PANEL_DESCRIPTION =
  'Harness interakcji Discord V2. Wybierz funkcję testową albo odśwież panel — bez reakcji emoji i bez spamu wiadomościami.';
export const PANEL_FOOTER_PREFIX = 'V2 • TEST';
export const SELECT_PLACEHOLDER = 'Wybierz funkcję testową';

export const SELECT_OPTIONS = [
  {
    value: 'system_status',
    label: 'Stan systemu',
    description: 'Bezpieczny status połączenia (ephemeral)',
    emoji: '🧭',
  },
  {
    value: 'reply_test',
    label: 'Test odpowiedzi',
    description: 'Potwierdzenie z correlation ID',
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
