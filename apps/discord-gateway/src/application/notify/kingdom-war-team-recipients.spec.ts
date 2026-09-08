import { beforeEach, describe, expect, it } from 'vitest';

import {
  listTeamKingdomWarRecipientScopes,
  replaceTeamKingdomWarRecipients,
  resetTeamKingdomWarRecipientsForTests,
  resolveTeamKingdomWarWorkspaceId,
} from './kingdom-war-team-recipients.js';

describe('team kingdom-war recipient registry', () => {
  beforeEach(() => {
    resetTeamKingdomWarRecipientsForTests();
  });

  it('isolates recipients for two workspaces', () => {
    replaceTeamKingdomWarRecipients('team-a', [
      '111111111111111111',
      '222222222222222222',
    ]);
    replaceTeamKingdomWarRecipients('team-b', ['333333333333333333']);

    const scopes = listTeamKingdomWarRecipientScopes();
    const a = scopes.find((scope) => scope.workspaceId === 'team-a');
    const b = scopes.find((scope) => scope.workspaceId === 'team-b');
    expect(a?.recipients).toEqual(['111111111111111111', '222222222222222222']);
    expect(b?.recipients).toEqual(['333333333333333333']);
  });

  it('replacing one team never alters another team', () => {
    replaceTeamKingdomWarRecipients('team-a', ['111111111111111111']);
    replaceTeamKingdomWarRecipients('team-b', ['222222222222222222']);
    replaceTeamKingdomWarRecipients('team-a', []);

    const scopes = listTeamKingdomWarRecipientScopes();
    expect(scopes.some((scope) => scope.workspaceId === 'team-a')).toBe(false);
    expect(scopes.find((scope) => scope.workspaceId === 'team-b')?.recipients).toEqual([
      '222222222222222222',
    ]);
  });

  it('filters invalid Discord ids and resolves stable scope tokens', () => {
    replaceTeamKingdomWarRecipients('team-a', [
      'bad',
      '111111111111111111',
      '111111111111111111',
    ]);
    const scope = listTeamKingdomWarRecipientScopes()[0];
    expect(scope?.recipients).toEqual(['111111111111111111']);
    expect(scope?.scopeToken).toBeTruthy();
    expect(resolveTeamKingdomWarWorkspaceId(scope!.scopeToken)).toBe('team-a');
  });
});
