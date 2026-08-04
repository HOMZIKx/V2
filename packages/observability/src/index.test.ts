import { describe, expect, it, vi } from 'vitest';

import { createLogger } from './index.js';

describe('createLogger', () => {
  it('writes structured entries for every level with and without context', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = createLogger('test-service');
    logger.debug('dbg');
    logger.info('started', { port: 3000 });
    logger.warn('slow');
    logger.error('failed', { code: 'EFAIL' });

    expect(debug).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"service":"test-service"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"context"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"code":"EFAIL"'));

    debug.mockRestore();
    info.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
