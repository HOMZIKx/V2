const OPAQUE_ID_PATTERN = /^[0-9a-f]{12}$/;

/** Derive 12-char lowercase hex opaque id from a UUID (left hex without dashes). */
export function opaqueIdFromUuid(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (hex.length < 12) {
    throw new Error('UUID must yield at least 12 hex characters');
  }
  return hex.slice(0, 12);
}

export function isValidOpaqueId(value: string): boolean {
  return OPAQUE_ID_PATTERN.test(value);
}
