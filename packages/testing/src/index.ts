import { expect } from 'vitest';

export function expectHealthyStatus(value: unknown): void {
  expect(value).toMatchObject({ status: 'ok' });
}
