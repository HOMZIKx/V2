const POLISH_DIACRITICS: Readonly<Record<string, string>> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'a',
  Ć: 'c',
  Ę: 'e',
  Ł: 'l',
  Ń: 'n',
  Ó: 'o',
  Ś: 's',
  Ź: 'z',
  Ż: 'z',
};

/** Allowed activity type key charset (matches admin + API validation). */
export const ACTIVITY_TYPE_KEY_PATTERN = /^[a-z0-9_:-]+$/;

/**
 * Derive a stable technical key from an owner-facing display name.
 * Example: "Lodowa Wiedźma" → "lodowa_wiedzma"
 */
export function deriveActivityTypeKey(label: string): string {
  let normalized = label.trim().toLowerCase();
  normalized = [...normalized].map((char) => POLISH_DIACRITICS[char] ?? char).join('');
  normalized = normalized
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 100);
}

export function isValidActivityTypeKey(key: string): boolean {
  return key.length > 0 && ACTIVITY_TYPE_KEY_PATTERN.test(key);
}
