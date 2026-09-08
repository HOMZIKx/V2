'use client';

import { useEffect, useRef } from 'react';

import { usePlayerStore } from './player-store-react';
import { createTeamInvitation } from './team-invitations-api';

/**
 * Bridges the legacy local invitation action to the authoritative server flow.
 * Existing screens can stay fast/optimistic, while every owner-created pending
 * invite is persisted in the shared workspace and becomes discoverable by the
 * recipient's authenticated Discord account.
 */
export function TeamInvitationSync() {
  const { state, hydrated, writesEnabled } = usePlayerStore();
  const attemptedAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!hydrated || !writesEnabled || !state.viewer) return;

    const viewerId = state.viewer.id;
    const viewerDiscordId = state.viewer.discordAccountId?.trim() ?? '';
    const now = Date.now();

    for (const workspace of state.workspaces) {
      if (workspace.archived) continue;
      const isOwner = workspace.members.some(
        (member) =>
          member.role === 'owner' &&
          (member.id === viewerId ||
            (!!viewerDiscordId && member.discordAccountId === viewerDiscordId)),
      );
      if (!isOwner) continue;

      for (const invitation of workspace.invitations) {
        if (invitation.status !== 'pending') continue;
        const key = `${workspace.id}:${invitation.recipientDiscordId}`;
        const lastAttempt = attemptedAtRef.current.get(key) ?? 0;
        if (now - lastAttempt < 5_000) continue;
        attemptedAtRef.current.set(key, now);

        void createTeamInvitation({
          workspaceId: workspace.id,
          recipientDiscordId: invitation.recipientDiscordId,
          recipientDisplayName: invitation.recipientDisplayName,
        }).catch((error) => {
          // Shared workspace initialisation can race the first invitation after
          // team creation. Allow a retry on the next state/effect pass.
          attemptedAtRef.current.delete(key);
          console.error('player-team: server invitation sync failed', error);
        });
      }
    }
  }, [hydrated, state.viewer, state.workspaces, writesEnabled]);

  return null;
}
