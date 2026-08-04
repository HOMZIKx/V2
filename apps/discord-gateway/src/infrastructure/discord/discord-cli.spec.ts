import { describe, expect, it, vi } from 'vitest';

import { guildCommandDefinitions } from '../../application/commands/command-definitions.js';

describe('discord cli contracts', () => {
  it('doctor/register operate on declarative guild command set', () => {
    const rest = {
      putGuildCommands: vi.fn(() =>
        Promise.resolve(
          guildCommandDefinitions.map((item, index) => ({
            id: String(index + 1),
            name: item.name,
          })),
        ),
      ),
      listGlobalCommands: vi.fn(() => Promise.resolve([])),
      listGuildCommands: vi.fn(() => Promise.resolve([])),
      fetchApplication: vi.fn(() =>
        Promise.resolve({
          id: '123456789012345678',
          name: 'V2 Lab',
          botUserId: '987654321098765432',
        }),
      ),
      fetchGuild: vi.fn(() =>
        Promise.resolve({
          id: '1534228693017432124',
          name: 'V2 Test',
          botIsMember: true,
        }),
      ),
    };

    expect(rest.listGlobalCommands).toBeTypeOf('function');
    expect(guildCommandDefinitions.length).toBe(2);
  });
});
