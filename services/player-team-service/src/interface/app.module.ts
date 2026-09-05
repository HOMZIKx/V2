import { Module } from '@nestjs/common';

import { HuntRoomsUseCases } from '../application/use-cases/hunt-rooms.use-cases.js';
import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamEnvProvider } from '../infrastructure/config/player-team-env.provider.js';
import { HuntRoomsRepository } from '../infrastructure/db/hunt-rooms.repository.js';
import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';

import { HealthController } from './health.controller.js';
import { HuntRoomsController } from './hunt-rooms.controller.js';
import { PlayerTeamController } from './player-team.controller.js';
import {
  HUNT_ROOMS_USE_CASES,
  PLAYER_TEAM_ENV,
  PLAYER_TEAM_STATE_USE_CASES,
} from './player-team.tokens.js';

@Module({
  controllers: [HealthController, PlayerTeamController, HuntRoomsController],
  providers: [
    PlayerTeamEnvProvider,
    {
      provide: PLAYER_TEAM_ENV,
      useFactory: (provider: PlayerTeamEnvProvider) => provider.get(),
      inject: [PlayerTeamEnvProvider],
    },
    PlayerTeamStateRepository,
    HuntRoomsRepository,
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
  ],
})
export class AppModule {}
