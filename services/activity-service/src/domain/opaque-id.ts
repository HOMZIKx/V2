import { randomBytes } from 'node:crypto';

const OPAQUE_ID_PATTERN = /^[0-9a-f]{12}$/;

/** 12-char lowercase hex opaque id (Discord custom_id segment). */
export function generateOpaqueId(): string {
  return randomBytes(6).toString('hex');
}

/** Derive opaque id from a UUID string (left 12 hex of uuid without dashes). */
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
