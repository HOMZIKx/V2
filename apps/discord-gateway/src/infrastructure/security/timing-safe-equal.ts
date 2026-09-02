import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time compare for secrets that may differ in length. */
export function timingSafeEqualUtf8(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}
