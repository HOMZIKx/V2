import { expect } from 'vitest';

export function expectHealthyStatus(value: unknown): void {
  expect(value).toEqual({ status: 'ok' });
}
