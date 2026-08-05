import { describe, expect, it, vi } from 'vitest';

import type { InternalJwtRuntime } from '../infrastructure/internal-jwt/create-internal-jwt-runtime.js';
import { InternalJwtLifecycleService } from './internal-jwt-lifecycle.service.js';

describe('InternalJwtLifecycleService', () => {
  it('closes the runtime exactly once on module destroy', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = { close } as unknown as InternalJwtRuntime;
    const service = new InternalJwtLifecycleService(runtime);

    await service.onModuleDestroy();
    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('no-ops when runtime is null', async () => {
    const service = new InternalJwtLifecycleService(null);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
