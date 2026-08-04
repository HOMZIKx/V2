import { describe, expect, it, vi } from 'vitest';

import { createLogger } from './index.js';

describe('createLogger', () => {
  it('writes a structured service-scoped entry', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    createLogger('test-service').info('started', { port: 3000 });

    expect(info).toHaveBeenCalledWith(expect.stringContaining('"service":"test-service"'));
    info.mockRestore();
  });
});
