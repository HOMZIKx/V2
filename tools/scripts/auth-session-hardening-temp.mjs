import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'apps/web/src/player-store.ts',
  `  if (outcome === 'authenticated') {
    let viewer: PlayerIdentity;
    if (identity && 'initials' in identity && typeof identity.id === 'string') {
      viewer = identity;
    } else {
      const input = identity as DiscordAuthViewerInput | undefined;
      const displayName = input?.displayName?.trim() || 'Mateusz';
      const v2UserId = input?.v2UserId?.trim();
      const discordAccountId = input?.discordUserId?.trim();
      const id = v2UserId || discordAccountId || 'mateusz';
      viewer = {
        id,
        displayName,
        discordDisplayName: displayName,
        initials: initialsFromDisplayName(displayName),
        ...(discordAccountId ? { discordAccountId } : {}),
      };
    }
    return {
      ...state,
      authStatus: 'authenticated',
      connection: 'connected',
      viewer,
      workspaces: state.workspaces,
      pendingIncomingInvitations: state.pendingIncomingInvitations,
    };
  }`,
  `  if (outcome === 'authenticated') {
    if (!identity) return state;

    let viewer: PlayerIdentity;
    if ('initials' in identity) {
      const id = identity.id.trim();
      if (!id) return state;
      viewer = { ...identity, id };
    } else {
      const displayName = identity.displayName.trim();
      const v2UserId = identity.v2UserId?.trim() ?? '';
      const discordAccountId = identity.discordUserId?.trim() ?? '';
      const id = v2UserId || discordAccountId;
      if (!displayName || !id) return state;
      viewer = {
        id,
        displayName,
        discordDisplayName: displayName,
        initials: initialsFromDisplayName(displayName),
        ...(discordAccountId ? { discordAccountId } : {}),
      };
    }
    return {
      ...state,
      authStatus: 'authenticated',
      connection: 'connected',
      viewer,
      workspaces: state.workspaces,
      pendingIncomingInvitations: state.pendingIncomingInvitations,
    };
  }`,
);

replaceOnce(
  'apps/web/src/identity-auth-client.ts',
  ` * \`GET /identity/web-oauth/discord\` (never fetch→redirect alone — that risks
 * \`state_mismatch\`). After Discord, Identity \`/identity/web-bridge\` reads
 * \`/identity/me\` same-origin and sends the viewer to web \`/auth/callback\`.`,
  ` * \`GET /identity/web-oauth/discord\` (never fetch→redirect alone — that risks
 * \`state_mismatch\`). After Discord, Identity \`/identity/web-bridge\` returns
 * to web \`/auth/callback\`, which independently verifies the active Identity session.`,
);

replaceOnce(
  'apps/web/src/identity-auth-client.ts',
  `
export function viewerFromCallbackSearchParams(params: URLSearchParams): PlayerIdentity | null {
  const viewerId = params.get('viewerId')?.trim();
  const displayName = params.get('displayName')?.trim();
  if (!viewerId || !displayName) return null;
  const discordAccountId = params.get('discordAccountId')?.trim() || null;
  // Bridge sends V2 uuid as viewerId + optional discordAccountId.
  return toPlayerIdentityFromSession({
    displayName,
    v2UserId: viewerId,
    discordAccountId,
  });
}
`,
  `
`,
);

replaceOnce(
  'apps/web/src/identity-auth-client.spec.ts',
  `import {
  toPlayerIdentityFromSession,
  viewerFromCallbackSearchParams,
} from './identity-auth-client';
import {
  completeDiscordAuth,
  createInitialPlayerStore,
  initialsFromDisplayName,
} from './player-store';`,
  `import { toPlayerIdentityFromSession } from './identity-auth-client';
import { completeDiscordAuth, createInitialPlayerStore } from './player-store';`,
);

replaceOnce(
  'apps/web/src/identity-auth-client.spec.ts',
  `
  it('parses auth callback query params (bridge)', () => {
    const params = new URLSearchParams({
      viewerId: 'uuid-1',
      displayName: 'Destiled',
      discordAccountId: '999',
    });
    const viewer = viewerFromCallbackSearchParams(params);
    expect(viewer?.id).toBe('999');
    expect(viewer?.discordAccountId).toBe('999');
  });
`,
  ``,
);

replaceOnce(
  'apps/web/src/identity-auth-client.spec.ts',
  `  it('keeps Mateusz demo when completeDiscordAuth has no identity', () => {
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    expect(state.viewer?.id).toBe('mateusz');
    expect(state.viewer?.displayName).toBe('Mateusz');
    expect(initialsFromDisplayName('Mateusz')).toBe('M');
  });`,
  `  it('refuses authenticated transition without a verified identity', () => {
    const initial = createInitialPlayerStore();
    const state = completeDiscordAuth(initial, 'authenticated');
    expect(state).toBe(initial);
    expect(state.authStatus).not.toBe('authenticated');
    expect(state.viewer).toBeNull();
  });

  it('refuses authenticated transition without a stable identity id', () => {
    const initial = createInitialPlayerStore();
    const state = completeDiscordAuth(initial, 'authenticated', { displayName: 'Fake' });
    expect(state).toBe(initial);
    expect(state.authStatus).not.toBe('authenticated');
    expect(state.viewer).toBeNull();
  });`,
);
