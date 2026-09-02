import { Module, type Provider } from '@nestjs/common';
import { Pool } from 'pg';

import type { CharacterOwnershipPort } from '../application/ports/player-workspace.ports.js';
import {
  parsePlayerWorkspaceEnv,
  type PlayerWorkspaceEnv,
} from '../infrastructure/config/player-workspace-env.js';
import { HttpIdentityCharacterOwnershipClient } from '../infrastructure/identity/identity-character-ownership-client.js';
import {
  createAssertionJtiStore,
  MemoryAssertionJtiStore,
  type AssertionJtiStore,
} from '../infrastructure/internal/assertion-jti-store.js';
import {
  loadInboundClientRegistry,
  type InboundClientRegistry,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import { PostgresPlayerWorkspaceRepository } from '../infrastructure/persistence/team-workspace.repository.js';
import { HealthController } from './health.controller.js';
import { InboundAssertionGuard } from './inbound-assertion.guard.js';
import {
  ASSERTION_JTI_STORE,
  CHARACTER_OWNERSHIP_PORT,
  INBOUND_CLIENT_REGISTRY,
  PLAYER_WORKSPACE_CONFIG,
  PLAYER_WORKSPACE_POOL,
  PLAYER_WORKSPACE_REPOSITORY,
} from './player-workspace.tokens.js';
import { TeamsController } from './teams.controller.js';

const providers: Provider[] = [
  {
    provide: PLAYER_WORKSPACE_CONFIG,
    useFactory: (): PlayerWorkspaceEnv => parsePlayerWorkspaceEnv(process.env),
  },
  {
    provide: PLAYER_WORKSPACE_POOL,
    useFactory: (config: PlayerWorkspaceEnv): Pool =>
      new Pool({ connectionString: config.PLAYER_WORKSPACE_DATABASE_URL }),
    inject: [PLAYER_WORKSPACE_CONFIG],
  },
  {
    provide: CHARACTER_OWNERSHIP_PORT,
    useFactory: (config: PlayerWorkspaceEnv): CharacterOwnershipPort | null =>
      HttpIdentityCharacterOwnershipClient.fromEnv(config),
    inject: [PLAYER_WORKSPACE_CONFIG],
  },
  {
    provide: PLAYER_WORKSPACE_REPOSITORY,
    useFactory: (pool: Pool, ownership: CharacterOwnershipPort | null) =>
      new PostgresPlayerWorkspaceRepository(pool, ownership),
    inject: [PLAYER_WORKSPACE_POOL, CHARACTER_OWNERSHIP_PORT],
  },
  {
    provide: INBOUND_CLIENT_REGISTRY,
    useFactory: async (config: PlayerWorkspaceEnv): Promise<InboundClientRegistry | null> => {
      if (config.inboundClientsJson === undefined) {
        return null;
      }
      return loadInboundClientRegistry(config.inboundClientsJson);
    },
    inject: [PLAYER_WORKSPACE_CONFIG],
  },
  {
    provide: ASSERTION_JTI_STORE,
    useFactory: (config: PlayerWorkspaceEnv): AssertionJtiStore | null => {
      if (config.PLAYER_WORKSPACE_REDIS_URL !== undefined) {
        return createAssertionJtiStore(
          config.PLAYER_WORKSPACE_REDIS_URL,
          config.PLAYER_WORKSPACE_ASSERTION_JTI_REDIS_PREFIX,
        );
      }
      if (config.NODE_ENV !== 'production') {
        return new MemoryAssertionJtiStore();
      }
      return null;
    },
    inject: [PLAYER_WORKSPACE_CONFIG],
  },
  InboundAssertionGuard,
];

@Module({
  controllers: [HealthController, TeamsController],
  providers,
})
export class AppModule {}
