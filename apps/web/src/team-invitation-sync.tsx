'use client';

import { useEffect, useRef } from 'react';

import {
  PLAYER_STORE_KEY,
  parsePlayerStore,
  serializePlayerStore,
  type PendingInvitation,
} from './player-store';
import { usePlayerStore } from './player-store-react';
import { createTeamInvitation, listTeamInvitations } from './team-invitations-api';

function invitationSignature(invitations: readonly PendingInvitation[]): string {
  return JSON.stringify(
    [...invitations]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({
        id: entry.id,
        teamId: entry.teamId,
        teamName: entry.teamName,
        inviterName: entry.inviterName,
        recipientDiscordId: entry.recipientDiscordId,
        recipientDisplayName: entry.recipientDisplayName,
        status: entry.status,
        createdLabel: entry.createdLabel,
        expiresLabel: entry.expiresLabel,
        revision: entry.revision,
      })),
  );
}

/**
 * Keeps both sides of team invitations server-backed:
 * - owner-created local optimistic invites are persisted to the shared workspace;
 * - recipient pending invites are discovered from PostgreSQL by verified Discord ID.
 *
 * Incoming invitation state is part of the legacy PlayerStore. Until that store
 * exposes a dedicated external setter, a changed authoritative list is persisted
 * atomically and the page is reloaded once so every existing screen sees it.
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

  useEffect(() => {
    if (!hydrated || !writesEnabled || !state.viewer) return;
    const discordId = state.viewer.discordAccountId?.trim() ?? '';
    if (!/^\d{17,20}$/.test(discordId)) return;

    let cancelled = false;
    let inFlight = false;

    const syncIncoming = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const incoming = await listTeamInvitations();
        if (cancelled) return;

        const raw = window.localStorage.getItem(PLAYER_STORE_KEY);
        const persisted = raw ? parsePlayerStore(raw) : null;
        const base = persisted ?? state;
        const current = base.pendingIncomingInvitations ?? [];
        if (invitationSignature(current) === invitationSignature(incoming)) return;

        const next = {
          ...base,
          pendingIncomingInvitations: [...incoming],
        };
        window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
        window.location.reload();
      } catch (error) {
        if (!cancelled) {
          console.error('player-team: incoming invitation discovery failed', error);
        }
      } finally {
        inFlight = false;
      }
    };

    void syncIncoming();
    const timer = window.setInterval(() => void syncIncoming(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated, state, state.viewer, writesEnabled]);

  return null;
}
