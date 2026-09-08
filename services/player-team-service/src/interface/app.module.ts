import { Module } from '@nestjs/common';

import { FixedHuntRoomsUseCases } from '../application/use-cases/fixed-hunt-rooms.use-cases.js';
import { HuntRoomsUseCases } from '../application/use-cases/hunt-rooms.use-cases.js';
import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamEnvProvider } from '../infrastructure/config/player-team-env.provider.js';
import { FixedHuntRoomsRepository } from '../infrastructure/db/fixed-hunt-rooms.repository.js';
import { HuntRoomsRepository } from '../infrastructure/db/hunt-rooms.repository.js';
import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';

import { FixedHuntRoomsController } from './fixed-hunt-rooms.controller.js';
import { HealthController } from './health.controller.js';
import { HuntRoomsController } from './hunt-rooms.controller.js';
import { PlayerTeamController } from './player-team.controller.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';
import { WorkspaceLiveController } from './workspace-live.controller.js';
import {
  FIXED_HUNT_ROOMS_USE_CASES,
  HUNT_ROOMS_USE_CASES,
  PLAYER_TEAM_ENV,
  PLAYER_TEAM_STATE_USE_CASES,
} from './player-team.tokens.js';

@Module({
  controllers: [
    HealthController,
    PlayerTeamController,
    HuntRoomsController,
    FixedHuntRoomsController,
    WorkspaceLiveController,
  ],
  providers: [
    PlayerTeamEnvProvider,
    {
      provide: PLAYER_TEAM_ENV,
      useFactory: (provider: PlayerTeamEnvProvider) => provider.get(),
      inject: [PlayerTeamEnvProvider],
    },
    PlayerTeamStateRepository,
    HuntRoomsRepository,
    FixedHuntRoomsRepository,
    WorkspaceLiveBus,
    {
      provide: PLAYER_TEAM_STATE_USE_CASES,
      useFactory: (
        repository: PlayerTeamStateRepository,
        env: ReturnType<PlayerTeamEnvProvider['get']>,
      ) =>
        new PlayerTeamStateUseCases(repository, {
          allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE,
        }),
      inject: [PlayerTeamStateRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: HUNT_ROOMS_USE_CASES,
      useFactory: (
        repository: HuntRoomsRepository,
        env: ReturnType<PlayerTeamEnvProvider['get']>,
      ) =>
        new HuntRoomsUseCases(repository, {
          allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE,
        }),
      inject: [HuntRoomsRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: FIXED_HUNT_ROOMS_USE_CASES,
      useFactory: (
        repository: FixedHuntRoomsRepository,
        env: ReturnType<PlayerTeamEnvProvider['get']>,
      ) =>
        new FixedHuntRoomsUseCases(repository, {
          allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE,
        }),
      inject: [FixedHuntRoomsRepository, PLAYER_TEAM_ENV],
    },
  ],
})
export class AppModule {}
