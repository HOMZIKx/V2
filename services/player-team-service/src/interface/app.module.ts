import { Module } from '@nestjs/common';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamEnvProvider } from '../infrastructure/config/player-team-env.provider.js';
import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';

import { HealthController } from './health.controller.js';
import { PlayerTeamController } from './player-team.controller.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';

@Module({
  controllers: [HealthController, PlayerTeamController],
  providers: [
    PlayerTeamEnvProvider,
    {
      provide: PLAYER_TEAM_ENV,
      useFactory: (provider: PlayerTeamEnvProvider) => provider.get(),
      inject: [PlayerTeamEnvProvider],
    },
    PlayerTeamStateRepository,
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
  ],
})
export class AppModule {}
