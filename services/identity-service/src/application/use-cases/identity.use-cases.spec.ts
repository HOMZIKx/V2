import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionPort } from '../ports/identity.ports.js';
import * as identity from './identity.use-cases.js';

describe('identity use-cases', () => {
  const headers = new Headers();

  it('delegate to the port', async () => {
    const getMe = vi.fn().mockResolvedValue(null);
    const listAccounts = vi.fn().mockResolvedValue([]);
    const startLink = vi.fn().mockResolvedValue({ url: 'https://provider.test/auth' });
    const unlinkAccount = vi.fn().mockResolvedValue(undefined);
    const logoutCurrent = vi.fn().mockResolvedValue({ setCookieHeaders: [] });
    const logoutAll = vi.fn().mockResolvedValue({ setCookieHeaders: [] });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    const port: IdentitySessionPort = {
      getMe,
      listAccounts,
      startLink,
      unlinkAccount,
      logoutCurrent,
      logoutAll,
      revokeAllSessionsForUser,
    };

    await identity.getMe(port, headers);
    await identity.listAccounts(port, headers);
    await identity.startLink(port, 'discord', headers, 'http://cb.test');
    await identity.unlinkAccount(port, 'acc-1', headers);
    await identity.logoutCurrent(port, headers);
    await identity.logoutAll(port, headers);
    await identity.revokeAllSessionsForUser(port, 'user-1');

    expect(getMe).toHaveBeenCalledWith(headers);
    expect(listAccounts).toHaveBeenCalledWith(headers);
    expect(startLink).toHaveBeenCalledWith('discord', headers, 'http://cb.test');
    expect(unlinkAccount).toHaveBeenCalledWith('acc-1', headers);
    expect(logoutCurrent).toHaveBeenCalledWith(headers);
    expect(logoutAll).toHaveBeenCalledWith(headers);
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
  });
});
