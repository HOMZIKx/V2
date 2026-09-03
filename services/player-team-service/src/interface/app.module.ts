import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { PlayerTeamController } from './player-team.controller.js';

import { PLAYER_TEAM_ENV } from './player-team.tokens.js';
import { PlayerTeamEnvProvider } from '../infrastructure/config/player-team-env.provider.js';

import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';
import { PlayerTeamStateService } from '../application/player-team-state.service.js';

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
    PlayerTeamStateService,
  ],
})
export class AppModule {}

