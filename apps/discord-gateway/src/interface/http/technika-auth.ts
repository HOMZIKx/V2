import { UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const TECHNIKA_SECRET_HEADER = 'x-technika-secret';

export function secretsMatch(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length === 0) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function assertTechnikaSecret(
  provided: string | undefined,
  expected: string | undefined,
): void {
  if (!secretsMatch(provided, expected)) {
    throw new UnauthorizedException({
      ok: false,
      error: 'invalid_technika_secret',
      hint: `Set header ${TECHNIKA_SECRET_HEADER} to match DISCORD_TECHNIKA_SHARED_SECRET.`,
    });
  }
}
