import { describe, expect, it } from 'vitest';

import { adminStatusMessage } from './status.js';

describe('adminStatusMessage', () => {
  it('identifies the technical screen', () => {
    expect(adminStatusMessage()).toBe('V2 Control Center');
  });
});
