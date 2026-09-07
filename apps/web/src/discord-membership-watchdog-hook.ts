'use client';

import { useEffect, useRef } from 'react';

import { MEMBERSHIP_CHECK_MS, shouldRevokeAppAccess } from './discord-membership-watchdog';
import { isDiscordAuthSimulateEnabled } from './identity-auth-client';
import { usePlayerStore } from './player-store-react';

/**
 * Periodically + on window focus: revoke local session when Identity is gone
 * or user is explicitly not in any bot guild (safe probes only).
 */
export function useDiscordMembershipWatchdog(): void {
  const { state, finishAuth, hydrated } = usePlayerStore();
  const running = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (state.authStatus !== 'authenticated') return;
    // Demo Mateusz — never revoke local session on simulate.
    if (isDiscordAuthSimulateEnabled()) return;

    const discordUserId =
      (state.viewer?.discordAccountId ?? '').trim() ||
      (state.viewer?.id && /^\d{17,20}$/.test(state.viewer.id) ? state.viewer.id : '');

    const run = async () => {
      if (running.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      running.current = true;
      try {
        const result = await shouldRevokeAppAccess({ discordUserId });
        if (result.revoke) {
          finishAuth('revoked');
        }
      } finally {
        running.current = false;
      }
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, MEMBERSHIP_CHECK_MS);

    const onFocus = () => {
      void run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [hydrated, state.authStatus, state.viewer, finishAuth]);
}
