import type { GuildCommandDefinition } from '../ports/gateway.ports.js';

export const TEST_COMMAND_VERSION = 'p1.0.0';

export const guildCommandDefinitions: GuildCommandDefinition[] = [
  {
    name: 'status',
    description: 'Pokaż bezpieczny status połączenia V2 LAB (ephemeral).',
    version: TEST_COMMAND_VERSION,
  },
  {
    name: 'panel-test',
    description: 'Opublikuj trwały panel testowy V2 LAB w tym kanale.',
    version: TEST_COMMAND_VERSION,
  },
];

export function assertGuildOnlyCommandRoute(route: string): void {
  if (route.includes('/commands') && !route.includes('/guilds/')) {
    throw new Error('Global command registration routes are forbidden.');
  }
}
