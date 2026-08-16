import type { GuildCommandDefinition } from '../ports/gateway.ports.js';

export const TEST_COMMAND_VERSION = 'p1.0.0';
export const ACTIVITY_COMMAND_VERSION = 'p4.2.0';

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
  {
    name: 'centrum-panel',
    description: 'Opublikuj / uzgodnij panel Centrum Aktywności w tym kanale (operator).',
    version: ACTIVITY_COMMAND_VERSION,
  },
  {
    name: 'centrum-status',
    description: 'Pokaż status panelu Centrum Aktywności (ephemeral).',
    version: ACTIVITY_COMMAND_VERSION,
  },
  {
    name: 'centrum-reconcile',
    description: 'Adoptuj / uzgodnij istniejącą wiadomość Centrum (operator).',
    version: ACTIVITY_COMMAND_VERSION,
  },
  {
    name: 'centrum-seed',
    description: 'Uruchom seed testowy activity-service (operator, non-prod).',
    version: ACTIVITY_COMMAND_VERSION,
  },
];

export function assertGuildOnlyCommandRoute(route: string): void {
  if (route.includes('/commands') && !route.includes('/guilds/')) {
    throw new Error('Global command registration routes are forbidden.');
  }
}
