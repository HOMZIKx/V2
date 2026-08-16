import { describe, expect, it } from 'vitest';

import { assertGuildOnlyCommandRoute, guildCommandDefinitions } from './command-definitions.js';

describe('command definitions', () => {
  it('declares LAB and Centrum guild commands', () => {
    expect(guildCommandDefinitions.map((item) => item.name).sort()).toEqual([
      'centrum-panel',
      'centrum-reconcile',
      'centrum-seed',
      'centrum-status',
      'panel-test',
      'status',
    ]);
  });

  it('rejects global command routes', () => {
    expect(() => assertGuildOnlyCommandRoute('/applications/123/commands')).toThrow(
      /Global command/,
    );
    expect(() =>
      assertGuildOnlyCommandRoute('/applications/123/guilds/456/commands'),
    ).not.toThrow();
  });
});
